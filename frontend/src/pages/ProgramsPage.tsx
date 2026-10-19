import { Link } from "react-router-dom";

export function ProgramsPage() {
  return (
    <div>
      <h1>Учебные программы</h1>
      <p className="muted">Математика и Python — отдельные программы академии. Курс Python открыт целиком, от первой программы до проекта.</p>
      <div className="grid">
        {import.meta.env.DEV ? (
          <a href="http://localhost:5173/programs" className="card dim" style={{ color: "inherit" }}>
            <span className="pill lock">Рядом</span>
            <h2>Математика</h2>
            <p className="muted">Школьный и вузовский курс Deep Forest. Открывается в своей программе.</p>
          </a>
        ) : (
          <article className="card dim">
            <span className="pill lock">Рядом</span>
            <h2>Математика</h2>
            <p className="muted">Школьный и вузовский курс Deep Forest. Открывается в своей программе.</p>
          </article>
        )}
        <Link to="/programs/python" className="card">
          <span className="pill ok">Открыта</span>
          <h2>Python (бета)</h2>
          <p className="muted">От первой программы до алгоритмов, SQL, pandas, API, backend, Git и финального проекта. Практика идёт в браузере.</p>
        </Link>
        <article className="card dim">
          <span className="pill lock">Скоро</span>
          <h2>Физика</h2>
          <p className="muted">Следующая программа академии.</p>
        </article>
      </div>
    </div>
  );
}
