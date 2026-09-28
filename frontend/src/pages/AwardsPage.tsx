import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import manifest from "../content/manifest.json";
import type { Manifest } from "../content/types";
import { formatGpa, letterFromGrade } from "../lib/grading";

const data = manifest as Manifest;

export function CertificatePage() {
  const { section = "" } = useParams();
  const [info, setInfo] = useState<{ number: string } | null>(null);
  const [error, setError] = useState("");
  const title = data.course.sections.find((item) => item.id === section)?.title || section;

  useEffect(() => {
    api<{ certificates: { section_id: string; number: string }[] }>("/api/python/certificates")
      .then((payload) => {
        const found = payload.certificates.find((item) => item.section_id === section);
        if (!found) setError("Сертификат появится, когда все уроки раздела будут пройдены, а не пропущены.");
        else setInfo(found);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Нужен вход"));
  }, [section]);

  return (
    <article className="certificate">
      <p className="eyebrow">Deep Forest Academy</p>
      <h1>Сертификат раздела</h1>
      <h2>{title}</h2>
      {info && <p>Номер {info.number}</p>}
      {error && <p>{error}</p>}
    </article>
  );
}

export function DiplomaPage() {
  const [payload, setPayload] = useState<{ ready: boolean; name: string; gpa: number | null; diploma: { number: string } | null } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ ready: boolean; name: string; gpa: number | null; diploma: { number: string } | null }>("/api/python/diploma")
      .then(setPayload)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Нужен вход"));
  }, []);

  return (
    <article className="certificate">
      <p className="eyebrow">Deep Forest Academy</p>
      <h1>Диплом Python (beta)</h1>
      {error && <p>{error}</p>}
      {payload && !payload.ready && <p>Диплом открывается после сертификатов всех опубликованных разделов.</p>}
      {payload?.diploma && (
        <>
          <p>{payload.name}</p>
          <p>Номер {payload.diploma.number}</p>
          {payload.gpa !== null && (
            <p>
              GPA {formatGpa(payload.gpa)} ({letterFromGrade(payload.gpa)})
            </p>
          )}
        </>
      )}
    </article>
  );
}
