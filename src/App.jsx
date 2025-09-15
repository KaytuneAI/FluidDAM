import React from "react";
import TestTLdraw from "./TestTLdraw8Refactored";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <TestTLdraw />
    </ErrorBoundary>
  );
}