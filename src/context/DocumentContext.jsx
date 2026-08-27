import React, { createContext, useState } from "react";

export const DocumentContext = createContext();

export const DocumentProvider = ({ children }) => {

  const [documents, setDocuments] = useState([]);

  // Upload document
  const uploadDocument = (file) => {

    const newDoc = {
      id: Date.now(),
      name: file.name,
      file: file,
      status: "Pending",
      stored: false   // blockchain status
    };

    setDocuments([...documents, newDoc]);
  };

  // Update approval status (Authority)
  const updateStatus = (id, status) => {

    setDocuments(
      documents.map((doc) =>
        doc.id === id ? { ...doc, status } : doc
      )
    );

  };

  // Mark document stored on blockchain
  const markStored = (id) => {

    setDocuments(
      documents.map((doc) =>
        doc.id === id ? { ...doc, stored: true } : doc
      )
    );

  };

  return (
    <DocumentContext.Provider
      value={{
        documents,
        uploadDocument,
        updateStatus,
        markStored
      }}
    >
      {children}
    </DocumentContext.Provider>
  );

};