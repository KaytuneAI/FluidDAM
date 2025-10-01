import React from "react";
import MainCanvas from "./MainCanvas";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <MainCanvas />
    </ErrorBoundary>
  );
}