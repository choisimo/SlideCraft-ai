import { useEffect, useState } from "react";

type User = { id: string; name: string; isOnline: boolean; color: string };
const seed: User[] = [
  { id: "u1", name: "Alex", isOnline: true, color: "#ef4444" },
  { id: "u2", name: "Sarah", isOnline: true, color: "#06b6d4" },
  { id: "u3", name: "Jamie", isOnline: false, color: "#a78bfa" },
];

export function usePresence() {
  const [users, setUsers] = useState<User[]>(seed);
  useEffect(() => {
    const t = setInterval(() => {
      setUsers((prev) => prev.map((u) => (Math.random() > 0.7 ? { ...u, isOnline: !u.isOnline } : u)));
    }, 5000);
    return () => clearInterval(t);
  }, []);
  return { users };
}
