/**
 * WaStore Client-Side JS
 * Handles Cart logic (localStorage) and Hybrid Checkout triggers.
 */

const Cart = {
  get: () => JSON.parse(localStorage.getItem('wastore_cart') || '[]'),
  
  save: (items) => localStorage.setItem('wastore_cart', JSON.stringify(items)),
  
  getItemKey: (item) => {
    const variantStr = item.selectedVariants ? JSON.stringify(item.selectedVariants) : '';
    return `${item.productId}_${variantStr}`;
  },

  add: (product) => {
    let items = Cart.get();
    const productKey = Cart.getItemKey(product);
    
    const existing = items.find(i => Cart.getItemKey(i) === productKey);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({ ...product, quantity: 1 });
    }
    
    Cart.save(items);
    
    const countBadge = document.getElementById('cart-count');
    if (countBadge) countBadge.innerText = items.reduce((acc, i) => acc + i.quantity, 0);

    if (window.showToast) {
      showToast(`${product.name} added to cart! 🛍️`);
    }
    
    window.dispatchEvent(new CustomEvent('cartUpdated'));
  },
  
  remove: (itemKey) => {
    let items = Cart.get().filter(i => Cart.getItemKey(i) !== itemKey);
    Cart.save(items);
    
    const countBadge = document.getElementById('cart-count');
    if (countBadge) countBadge.innerText = items.reduce((acc, i) => acc + i.quantity, 0);

    window.dispatchEvent(new CustomEvent('cartUpdated'));

    if (items.length === 0 && window.location.pathname.endsWith('/cart')) {
      location.reload();
    }
  },

  updateQuantity: (itemKey, delta) => {
    let items = Cart.get();
    const item = items.find(i => Cart.getItemKey(i) === itemKey);
    if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
        return Cart.remove(itemKey);
      }
      Cart.save(items);
      const countBadge = document.getElementById('cart-count');
      if (countBadge) countBadge.innerText = items.reduce((acc, i) => acc + i.quantity, 0);
      window.dispatchEvent(new CustomEvent('cartUpdated'));
    }
  },
  
  clear: () => localStorage.removeItem('wastore_cart')
};

// Auto-hide flash messages
document.addEventListener('DOMContentLoaded', () => {
  const flashes = document.querySelectorAll('.flash');
  flashes.forEach(f => {
    setTimeout(() => {
      f.style.opacity = '0';
      setTimeout(() => f.remove(), 500);
    }, 4000);
  });
});
