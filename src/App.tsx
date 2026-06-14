import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { useResumeInterrupted } from "./hooks/usePipeline";
import { requestPersistence } from "./local/storage";
import Editor from "./pages/Editor";
import Library from "./pages/Library";

export default function App() {
  useResumeInterrupted();

  useEffect(() => {
    void requestPersistence();
  }, []);

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Library />} />
        <Route path="/editor/:fileId" element={<Editor />} />
      </Route>
    </Routes>
  );
}
