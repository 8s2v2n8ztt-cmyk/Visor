import React from "react";
import ReactDOM from "react-dom/client";
import VisorNacionalClient from "./visor-nacional-client";
import "./globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <VisorNacionalClient />
  </React.StrictMode>,
);
