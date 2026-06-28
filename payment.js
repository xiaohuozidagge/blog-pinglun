const USER_ID_STORAGE_KEY = 'auto_comment_user_id';
const API_BASE = 'https://jieyunsang.cn/api';

const PLANS = {
  blog_250: {
    name: '博客列表基础包',
    priceText: '￥19.9'
  },
  as_50: {
    name: '高 AS 博客精选包',
    priceText: '￥19.9'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backBtn');
  const payBtn = document.getElementById('payBtn');
  const payStatus = document.getElementById('payStatus');
  const userIdText = document.getElementById('userIdText');
  const planNameText = document.getElementById('planNameText');
  const priceText = document.getElementById('priceText');
  const planCards = Array.from(document.querySelectorAll('.plan-card'));

  let selectedPlanId = 'blog_250';
  let currentUserId = '';
  let currentOrder = null;
  let countdownTimer = null;

  function getSelectedPlan() {
    return PLANS[selectedPlanId] || PLANS.blog_250;
  }

  function isPendingOrder(order) {
    return order && order.status === 'pending_payment' && Number(order.remainingSeconds) > 0;
  }

  function formatRemaining(seconds) {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    if (hours > 0) {
      return `${hours}小时${String(minutes).padStart(2, '0')}分${String(secs).padStart(2, '0')}秒`;
    }
    return `${minutes}分${String(secs).padStart(2, '0')}秒`;
  }

  function setPayStatus(text, isError = false) {
    payStatus.textContent = text;
    payStatus.style.color = isError ? '#dc2626' : '#6b7280';
  }

  function setPayButtonIdle() {
    if (currentOrder && currentOrder.status === 'paid_pending_fulfillment') {
      payBtn.disabled = true;
      payBtn.textContent = '已支付，等待发货';
      return;
    }
    payBtn.disabled = false;
    payBtn.textContent = isPendingOrder(currentOrder) ? '继续支付未支付订单' : '支付宝支付';
  }

  function setPayLoading(isLoading) {
    payBtn.disabled = isLoading;
    payBtn.textContent = isLoading ? '正在处理订单...' : '';
    if (!isLoading) {
      setPayButtonIdle();
    }
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function renderSelectedPlan() {
    const selectedPlan = getSelectedPlan();
    planCards.forEach((card) => {
      card.classList.toggle('selected', card.dataset.planId === selectedPlanId);
    });
    planNameText.textContent = selectedPlan.name;
    priceText.textContent = selectedPlan.priceText;
    if (!currentOrder) {
      setPayStatus('选择套餐后点击支付宝支付，将创建订单并跳转到支付宝收银台。订单有效期为 2 小时。');
    }
    setPayButtonIdle();
  }

  function renderPendingOrder(order) {
    const selectedPlan = PLANS[order.planId] || null;
    if (selectedPlan) {
      selectedPlanId = order.planId;
      renderSelectedPlan();
    }

    function tick() {
      const remainingSeconds = Number(order.remainingSeconds) || 0;
      if (remainingSeconds <= 0) {
        stopCountdown();
        currentOrder = null;
        setPayStatus('未支付订单已超过 2 小时并失效，可以重新创建订单。', true);
        setPayButtonIdle();
        return;
      }
      setPayStatus(`你有一笔未支付订单，优先继续支付。订单号：${order.outTradeNo}，剩余 ${formatRemaining(remainingSeconds)}。`);
      order.remainingSeconds = remainingSeconds - 1;
    }

    stopCountdown();
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function renderOrderStatus(order) {
    stopCountdown();
    currentOrder = order && order.status !== 'none' ? order : null;

    if (!currentOrder) {
      renderSelectedPlan();
      return;
    }

    if (isPendingOrder(currentOrder)) {
      renderPendingOrder(currentOrder);
      setPayButtonIdle();
      return;
    }

    if (currentOrder.status === 'paid_pending_fulfillment') {
      setPayStatus(`订单 ${currentOrder.outTradeNo} 已支付，正在等待人工发货。`);
      setPayButtonIdle();
      return;
    }

    if (currentOrder.status === 'fulfilled') {
      setPayStatus('你最近一笔订单已发货。如需购买其他套餐，可以继续下单。');
      currentOrder = null;
      setPayButtonIdle();
      return;
    }

    if (currentOrder.status === 'closed') {
      setPayStatus('最近一笔订单已关闭，可以重新创建支付订单。');
      currentOrder = null;
      setPayButtonIdle();
      return;
    }

    setPayStatus(currentOrder.statusText || '已查询到最近订单状态。');
    setPayButtonIdle();
  }

  function openUrl(url) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function loadPaymentStatus() {
    if (!currentUserId) return;
    setPayStatus('正在查询是否有未支付订单...');
    try {
      const response = await fetch(`${API_BASE}/purchase-status?userId=${encodeURIComponent(currentUserId)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        setPayStatus(data.message || data.error || '查询支付状态失败，请稍后重试。', true);
        return;
      }
      renderOrderStatus(data);
    } catch (error) {
      console.error('查询支付状态失败', error);
      setPayStatus('网络错误，查询支付状态失败。', true);
    }
  }

  function loadUserId() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
      userIdText.textContent = '未设置';
      return;
    }

    chrome.storage.sync.get([USER_ID_STORAGE_KEY], (data) => {
      currentUserId = data && data[USER_ID_STORAGE_KEY] ? String(data[USER_ID_STORAGE_KEY]).trim() : '';
      userIdText.textContent = currentUserId || '未设置';
      if (!currentUserId) {
        setPayStatus('请先返回设置页填写并保存用户 ID。', true);
        return;
      }
      loadPaymentStatus();
    });
  }

  planCards.forEach((card) => {
    card.addEventListener('click', () => {
      if (isPendingOrder(currentOrder)) {
        setPayStatus('当前有未支付订单，请先继续支付或等待倒计时结束。', true);
        return;
      }
      selectedPlanId = card.dataset.planId;
      currentOrder = null;
      renderSelectedPlan();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      card.click();
    });
  });

  backBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: 'options.html' });
      return;
    }
    window.location.href = 'options.html';
  });

  payBtn.addEventListener('click', async () => {
    if (!currentUserId) {
      setPayStatus('请先返回设置页填写并保存用户 ID。', true);
      return;
    }

    setPayLoading(true);
    setPayStatus(isPendingOrder(currentOrder) ? '正在打开未支付订单...' : '正在创建支付宝订单...');

    try {
      const response = await fetch(`${API_BASE}/alipay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          planId: isPendingOrder(currentOrder) ? currentOrder.planId : selectedPlanId
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.order) {
          renderOrderStatus(data.order);
        }
        setPayStatus(data.message || data.error || '创建订单失败，请稍后重试。', true);
        return;
      }

      if (data.order && isPendingOrder(data.order)) {
        currentOrder = data.order;
        renderPendingOrder(currentOrder);
      } else if (data.expiresAt) {
        currentOrder = {
          status: 'pending_payment',
          statusText: '待支付',
          planId: data.plan && data.plan.id,
          planName: data.plan && data.plan.name,
          outTradeNo: data.outTradeNo,
          expiresAt: data.expiresAt,
          remainingSeconds: data.remainingSeconds
        };
        renderPendingOrder(currentOrder);
      }

      setPayStatus(data.reused ? '正在打开已有未支付订单的支付宝收银台。' : '订单已创建，正在打开支付宝收银台。');
      openUrl(data.payUrl);
    } catch (error) {
      console.error('创建支付宝订单失败', error);
      setPayStatus('网络错误，创建订单失败。', true);
    } finally {
      setPayLoading(false);
    }
  });

  renderSelectedPlan();
  loadUserId();
});
