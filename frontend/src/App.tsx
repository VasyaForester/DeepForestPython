import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { CertificatePage, DiplomaPage } from "./pages/AwardsPage";
import { CoursePage } from "./pages/CoursePage";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { LessonPage } from "./pages/LessonPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ProgramsPage } from "./pages/ProgramsPage";
import { ReferencePage, SearchPage } from "./pages/SearchPage";
import { SectionPage } from "./pages/SectionPage";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");
const embedded = basename !== "";

export function App() {
  return (
    <BrowserRouter basename={embedded ? basename : undefined}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to={embedded ? "/programs/python" : "/programs"} replace />} />
          {embedded ? (
            <Route path="/programs" element={<Navigate to="/programs/python" replace />} />
          ) : (
            <Route path="/programs" element={<ProgramsPage />} />
          )}
          <Route path="/programs/python" element={<CoursePage />} />
          <Route path="/programs/python/section/:slug" element={<SectionPage />} />
          <Route path="/programs/python/lesson/:slug" element={<LessonPage />} />
          <Route path="/programs/python/search" element={<SearchPage />} />
          <Route path="/programs/python/reference" element={<ReferencePage />} />
          <Route path="/programs/python/diagnostic" element={<DiagnosticPage />} />
          <Route path="/programs/python/profile" element={<ProfilePage />} />
          <Route path="/programs/python/certificate/:section" element={<CertificatePage />} />
          <Route path="/programs/python/diploma" element={<DiplomaPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
