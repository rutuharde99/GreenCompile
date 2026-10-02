import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { AnalysisProvider } from "./context/AnalysisProvider";

import Home from "./pages/Home";
import CodeAnalyzer from "./pages/CodeAnalyzer";
import Dashboard from "./pages/Dashboard";
import Analysis from "./pages/Analysis";
import AIRecommendations from "./pages/AIRecommendations";
import Optimization from "./pages/Optimization";

function App() {
  return (
    <AnalysisProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />

          <Route element={<Layout />}>
            {/* /dashboard = overview + charts, /analysis = detailed compiler/static/performance report */}
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/analyzer" element={<CodeAnalyzer />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/ai" element={<AIRecommendations />} />
            <Route path="/optimization" element={<Optimization />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AnalysisProvider>
  );
}

export default App;
