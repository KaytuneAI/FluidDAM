import React from "react";
import TestTLdraw from "./TestTLdraw7";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <TestTLdraw />
    </ErrorBoundary>
  );
}