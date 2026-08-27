import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

function DocumentStats({ documents }) {

  const approved = documents.filter(d => d.status === "Approved").length;
  const pending = documents.filter(d => d.status === "Pending").length;
  const rejected = documents.filter(d => d.status === "Rejected").length;

  const data = [
    { name: "Approved", value: approved },
    { name: "Pending", value: pending },
    { name: "Rejected", value: rejected }
  ];

  return (
    <div style={{ marginTop: "30px" }}>

      <div className="stats-container">

        <div className="stat-card approved">
          <h3>{approved}</h3>
          <p>Approved Documents</p>
        </div>

        <div className="stat-card pending">
          <h3>{pending}</h3>
          <p>Pending Documents</p>
        </div>

        <div className="stat-card rejected">
          <h3>{rejected}</h3>
          <p>Rejected Documents</p>
        </div>

      </div>

      <div style={{ width: "100%", height: 300, marginTop: "40px" }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="name"/>
            <YAxis/>
            <Tooltip/>
            <Bar dataKey="value"/>
          </BarChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}

export default DocumentStats;