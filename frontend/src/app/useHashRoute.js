import { useCallback, useEffect, useState } from "react";

function readRoute() {
  const value = window.location.hash.replace(/^#/, "");
  return value || "/";
}

export function useHashRoute() {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const handleChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", handleChange);
    return () => window.removeEventListener("hashchange", handleChange);
  }, []);

  const navigate = useCallback((path) => {
    const next = path.startsWith("/") ? path : `/${path}`;
    if (readRoute() === next) {
      setRoute(next);
      return;
    }
    window.location.hash = next;
  }, []);

  return { route, navigate };
}
