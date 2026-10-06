import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type Progress, type User } from "../api";
import { formatGpa } from "../lib/grading";

export function Crest() {
  return <img src="/crest.png" alt="Герб Deep Forest Academy" draggable={false} />;
}

const embedded = import.meta.env.BASE_URL !== "/";

export function Layout() {
  const [user, setUser] = useState<User | null>(null);
  const [gpa, setGpa] = useState<number | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    api<{ user: User | null }>("/api/python/me")
      .then(async (data) => {
        setUser(data.user);
        if (data.user) {
          const progress = await api<Progress>("/api/python/progress");
          setGpa(progress.gpa);
        }
      })
      .catch(() => setUser(null));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        {embedded ? (
          <a href="/programs" className="brand">
            <Crest />
            <div className="brand-name">
              <strong>Deep Forest Academy</strong>
            </div>
          </a>
        ) : (
          <Link to="/programs" className="brand">
            <Crest />
            <div className="brand-name">
              <strong>Deep Forest Academy</strong>
            </div>
          </Link>
        )}
        <nav className="nav">
          {embedded ? (
            <a href="/programs">Программы</a>
          ) : (
            <NavLink to="/programs" end>
              Программы
            </NavLink>
          )}
          <NavLink to="/programs/python">Python (бета)</NavLink>
          <NavLink to="/programs/python/search">Поиск</NavLink>
          <NavLink to="/programs/python/reference">Справочник</NavLink>
          <NavLink to="/programs/python/diagnostic">Диагностика</NavLink>
          <NavLink to="/programs/python/profile">{user?.name || "Профиль"}</NavLink>
          {gpa !== null && <span className="pill ok">Средний балл {formatGpa(gpa)}</span>}
          {user && (
            <button
              className="linkish"
              type="button"
              onClick={async () => {
                if (embedded && localStorage.getItem("dfa-session-v1")) {
                  localStorage.removeItem("dfa-session-v1");
                  window.location.href = "/";
                  return;
                }
                await api("/api/python/auth/logout", { method: "POST" });
                nav("/programs/python/profile");
                window.location.reload();
              }}
            >
              Выйти
            </button>
          )}
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">Deep Forest Academy</footer>
    </div>
  );
}
