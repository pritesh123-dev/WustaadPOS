import { useEffect, useState } from 'react';

// Tiny hash router: #/pos, #/orders, #/admin/menu …  (works offline and on any static host)
const current = () => (window.location.hash.replace(/^#/, '') || '/pos').split('?')[0];

export function useRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const onChange = () => setRoute(current());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const navigate = (path) => { window.location.hash = path; };
