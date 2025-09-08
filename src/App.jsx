import React from "react";
import TestTLdraw from "./TestTLdraw6";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <TestTLdraw />
    </ErrorBoundary>
  );
}