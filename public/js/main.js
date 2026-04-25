/**
 * WaStore Client-Side JS
 * Handles Cart logic (localStorage) and Hybrid Checkout triggers.
 */

const Cart = {
  get: () => JSON.parse(localStorage.getItem('wastore_cart') || '[]'),
  
  save: (items) => localStorage.setItem('wastore_cart', JSON.stringify(items)),
  
  add: (product) => {
    let items = Cart.get();
    const existing = items.find(i => i.productId === product.productId);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.push({ ...product, quantity: 1 });
    }
    Cart.save(items);
    if (window.showToast) {
      showToast(`${product.name} added to cart! 🛍️`);
    }
  },
  
  remove: (productId) => {
    let items = Cart.get().filter(i => i.productId !== productId);
    Cart.save(items);
    
    // Attempt to update the cart UI dynamically
    const row = document.getElementById(`cart-item-${productId}`);
    if (row) row.remove();
    
    const countBadge = document.getElementById('cart-count');
    if (countBadge) countBadge.innerText = items.length;

    // Dispatch custom event so the cart page can update totals
    window.dispatchEvent(new CustomEvent('cartUpdated'));

    if (items.length === 0 && window.location.pathname.endsWith('/cart')) {
      location.reload(); // Reload to show empty state
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
