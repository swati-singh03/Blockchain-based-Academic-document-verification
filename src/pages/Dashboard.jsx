import React, { useContext, useEffect, useState, useCallback, useMemo } from "react";
import { DocumentContext } from "../context/DocumentContext";
import DocumentStats from "../components/DocumentStats";
import { useNavigate } from "react-router-dom";
import { registerHash } from "../blockchain";
import { ethers } from "ethers";
import { convertPdfToImages } from "../utils/pdfToImages";
import { 
  Search, 
  Filter, 
  Download, 
  Share, 
  Clock, 
  AlertCircle,
  Shield,
  TrendingUp,
  BarChart3,
  FileText,
  Copy,
  RefreshCw,
  CheckCircle,
  Send,
  X,
  Eye,
  Image as ImageIcon,
  File,
  Loader,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Download as DownloadIcon,
  Trash2
} from 'lucide-react';

function UserDashboard() {
  const navigate = useNavigate();
  const { uploadDocument } = useContext(DocumentContext);

  // Enhanced State management
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [pdfPages, setPdfPages] = useState([]); // 🆕 all rendered PDF pages (real images)
  const [pdfRawDataUrl, setPdfRawDataUrl] = useState(null); // 🆕 raw PDF for metadata forensics
  const [pdfRenderProgress, setPdfRenderProgress] = useState(0); // 🆕
  const [showModal, setShowModal] = useState(false);
  const [selectedAuthority, setSelectedAuthority] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [authorities, setAuthorities] = useState([]);
  const [localDocs, setLocalDocs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("sentAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(null);

  const user = localStorage.getItem("currentUser") || "User";

  // 🆕 Storage quota manager
  const [storageQuota, setStorageQuota] = useState({ usageMB: 0, quotaMB: 10, availableMB: 10, isLow: false });

  const checkStorageQuota = useCallback(() => {
    try {
      const quota = navigator.storage?.estimate();
      if (quota) {
        const usageMB = quota.usage / (1024 * 1024);
        const quotaMB = quota.quota / (1024 * 1024);
        const availableMB = quotaMB - usageMB;
        const isLow = availableMB < 1;
        setStorageQuota({ usageMB, quotaMB, availableMB, isLow });
        return { usageMB, quotaMB, availableMB, isLow };
      }
    } catch (e) {}
    return storageQuota;
  }, [storageQuota]);

  // 🆕 🧹 FIXED CLEAN STORAGE - MOST RECENT 5
  const cleanLocalStorage = () => {
    try {
      const essentialKeys = ['currentUser', 'role'];
      const allKeys = Object.keys(localStorage);
      
      const cleanedKeys = allKeys.filter(key => 
        !key.startsWith('documents') && 
        !key.startsWith('authorityDocs_') && 
        !key.startsWith('authorityNotifications_') &&
        !essentialKeys.includes(key)
      );
      
      cleanedKeys.forEach(key => localStorage.removeItem(key));
      
      let allDocs = JSON.parse(localStorage.getItem("documents") || "[]");
      
      const userDocs = allDocs.filter(doc => doc.user === user);
      const recent5 = userDocs
        .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
        .slice(0, 5);
      
      const otherDocs = allDocs.filter(doc => doc.user !== user);
      const finalDocs = [...otherDocs, ...recent5];
      
      localStorage.setItem("documents", JSON.stringify(finalDocs));
      
      loadUserDocs();
      checkStorageQuota();
      addNotification(`🧹 Cleaned! Kept your 5 most recent docs (${recent5.length})`, "success");
    } catch (error) {
      addNotification("❌ Cleanup failed", "error");
    }
  };

  // 🔥 **UPDATED compressImage - HIGH QUALITY 300KB + 800px**
  const compressImage = (file, maxSizeKB = 300, quality = 0.9) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        let { width, height } = img;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let sizeKB = dataUrl.length * 0.75 / 1024;
        
        while (sizeKB > maxSizeKB && quality > 0.7) {
          quality -= 0.05;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          sizeKB = dataUrl.length * 0.75 / 1024;
        }
        
        resolve(dataUrl);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  // 🆕 FIXED: loadUserDocs - NO statusLocked interference
  const loadUserDocs = () => {
    try {
      let allDocs = JSON.parse(localStorage.getItem("documents") || "[]");
      console.log("📋 All docs loaded:", allDocs.length);
      
      allDocs = cleanupOldDocuments(allDocs);
      localStorage.setItem("documents", JSON.stringify(allDocs));
      
      const userDocs = allDocs.filter(doc => doc.user === user);
      console.log(`👤 ${user} docs:`, userDocs.length);
      
      setLocalDocs(userDocs);
    } catch (error) {
      console.error("❌ Load docs error:", error);
      setLocalDocs([]);
    }
  };

  // Check blocked status
  useEffect(() => {
    const blockedData = JSON.parse(localStorage.getItem("blockedUsers") || "{}");
    const userRejections = JSON.parse(localStorage.getItem("userRejections") || "{}");
    const isUserBlocked = !!blockedData[user] || userRejections[user]?.count >= 3;
    setIsBlocked(isUserBlocked);
  }, [user]);

 // Load authorities — restricted to UMIT only
  useEffect(() => {
    setAuthorities([
      { name: "Usha Mittal Institute of Technology", emoji: "🎓" }
    ]);
  }, []);

  // 🆕 Auto-refresh (30s interval)
  useEffect(() => {
    loadUserDocs();
    const refreshInterval = setInterval(loadUserDocs, 30000);
    return () => clearInterval(refreshInterval);
  }, [user]);

  // 🆕 Storage monitor
  useEffect(() => {
    checkStorageQuota();
    const interval = setInterval(checkStorageQuota, 10000);
    return () => clearInterval(interval);
  }, []);

  // Role check
  useEffect(() => {
    const role = localStorage.getItem("role");
    if (!role || role !== "user") navigate("/login");
  }, [navigate]);

  // 🆕 Smart cleanup function
  const cleanupOldDocuments = (docs, maxPerUser = 50) => {
    const userDocs = {};
    docs.forEach(doc => {
      if (!userDocs[doc.user]) userDocs[doc.user] = [];
      userDocs[doc.user].push(doc);
    });
    
    const cleaned = [];
    Object.values(userDocs).forEach(userArray => {
      cleaned.push(...userArray.slice(-maxPerUser));
    });
    
    return cleaned.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  };

  // 🆕 Emergency cleanup
  const emergencyCleanup = () => {
    try {
      const allDocs = JSON.parse(localStorage.getItem("documents") || "[]");
      return allDocs.slice(0, 10);
    } catch {
      return [];
    }
  };

  // 🆕 Safe storage setter
  const safeSetStorage = (key, data) => {
    try {
      const stringData = JSON.stringify(data);
      const sizeKB = stringData.length * 0.75 / 1024;
      
      if (sizeKB > 4000) {
        console.warn(`Large storage: ${Math.round(sizeKB)}KB for ${key}`);
      }
      
      localStorage.setItem(key, stringData);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.error("Storage quota exceeded, emergency cleanup");
        const cleaned = emergencyCleanup();
        localStorage.setItem("documents", JSON.stringify(cleaned));
        return false;
      }
      throw error;
    }
  };

  // 🆕 FIXED NOTIFICATION SYSTEM
  useEffect(() => {
    const checkNotifications = () => {
      try {
        const allDocs = JSON.parse(localStorage.getItem("documents") || "[]");
        const userDocs = allDocs.filter(doc => doc.user === user);
        
        const newNotifications = [];
        
        userDocs.forEach(doc => {
          if (doc.status === "Approved" && !doc.notifiedApproved) {
            newNotifications.push(`✅ ${doc.name} APPROVED by ${doc.authority}!`);
            allDocs.forEach((d, i) => {
              if (d.id === doc.id) allDocs[i] = { ...d, notifiedApproved: true };
            });
            safeSetStorage("documents", allDocs);
          } else if (doc.status === "Rejected" && !doc.notifiedRejected) {
            newNotifications.push(`❌ ${doc.name} REJECTED by ${doc.authority}`);
            allDocs.forEach((d, i) => {
              if (d.id === doc.id) allDocs[i] = { ...d, notifiedRejected: true };
            });
            safeSetStorage("documents", allDocs);
          }
        });
        
        if (newNotifications.length > 0) {
          setNotifications(prev => [...newNotifications.map(msg => ({
            id: Date.now() + Math.random(),
            message: msg,
            type: msg.includes('APPROVED') ? 'success' : 'error',
            timestamp: new Date()
          })), ...prev.slice(0, 10)]);
        }
      } catch (error) {
        console.error("Notification error:", error);
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // 🆕 AUTO-CLEAR notifications after 5 minutes
  useEffect(() => {
    if (notifications.length > 0) {
      const timer = setTimeout(() => {
        setNotifications([]);
      }, 5 * 60 * 1000);
      return () => clearTimeout(timer);
    }
  }, [notifications.length]);

  const filteredDocs = useMemo(() => {
    let filtered = localDocs.filter(doc => {
      const matchesSearch = doc.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           doc.authority?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || doc.status === filterStatus;
      return matchesSearch && matchesStatus;
    });

    return filtered.sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (sortBy === 'sentAt') {
        return sortOrder === 'desc' 
          ? new Date(bVal) - new Date(aVal)
          : new Date(aVal) - new Date(bVal);
      }
      return sortOrder === 'desc' 
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
  }, [localDocs, searchTerm, filterStatus, sortBy, sortOrder]);

  // 🔥 **UPDATED handleFile — REAL PDF PAGE RENDERING (no more fake placeholder)**
  const handleFile = async (e) => {
    if (isBlocked) {
      addNotification("🚫 You are blocked from uploading!", "error");
      return;
    }
    
    const f = e.target.files[0];
    if (f) {
      if (f.size > 10 * 1024 * 1024) {
        addNotification("❌ File too large! Max 10MB", "error");
        return;
      }

      setLoading(true);
      try {
        let previewData = null;
        
        if (f.type.startsWith('image/')) {
          previewData = await compressImage(f, 300, 0.9); // 🔥 High quality 300KB
          setPdfPages([]);
          setPdfRawDataUrl(null);
        } else if (f.type === 'application/pdf') {
          // 🔥 REAL PAGE-BY-PAGE RENDERING — replaces the old 1x1 fake placeholder
          setPdfRenderProgress(0);
          addNotification(`📄 Rendering PDF pages...`, "info");

          const { pages, totalPages, renderedPages, rawDataUrl } = await convertPdfToImages(f, {
            scale: 1.5,
            maxPages: 15,
          });

          setPdfPages(pages);
          setPdfRawDataUrl(rawDataUrl);
          previewData = pages[0]?.dataUrl || null; // page 1 used as the thumbnail

          addNotification(
            `✅ ${renderedPages}/${totalPages} page(s) rendered from PDF${
              totalPages > renderedPages ? ` (first ${renderedPages} used)` : ""
            }`,
            "success"
          );
        } else {
          previewData = URL.createObjectURL(f);
          setPdfPages([]);
          setPdfRawDataUrl(null);
        }

        setFilePreview(previewData);
        setFile(f); // 🔥 Original file untouched
        setShowModal(true);
        addNotification(`📁 ${f.name} loaded (${Math.round(f.size/1024)}KB) - High Quality`, "info");
      } catch (error) {
        console.error("Preview generation error:", error);
        addNotification("❌ Preview failed", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const addNotification = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [{ id, message, type, timestamp: new Date() }, ...prev.slice(0, 9)]);
  };

  // 🔥 **UPDATED sendToAuthority — carries every rendered PDF page + raw PDF forward**
  const sendToAuthority = async () => {
    if (isBlocked) return addNotification("🚫 Blocked from sending!", "error");
    if (!selectedAuthority || !file) return addNotification("⚠️ Select authority & file!", "warning");

    const quota = checkStorageQuota();
    if (quota.isLow) {
      addNotification("💾 Storage full! Clear old documents.", "warning");
      return;
    }

    setLoading(true);
    
    try {
      let thumbnailData = null;
      let highQualityPreview = filePreview;
      
      if (file.type.startsWith('image/')) {
        thumbnailData = await compressImage(file, 60, 0.7);
      }

      console.log("🔥 Creating hash from original file...");
      const buffer = await file.arrayBuffer();
      const originalHash = ethers.keccak256(new Uint8Array(buffer));
      console.log("✅ HASH GENERATED:", originalHash);

      const newDoc = {
        id: Date.now() + Math.random(),
        name: file.name,
        user,
        authority: selectedAuthority,
        status: "Pending",
        sentAt: new Date().toISOString(),
        fileSize: Math.round(file.size / 1024),
        fileType: file.type,
        thumbnailData,
        previewData: highQualityPreview,
        pages: file.type === 'application/pdf' ? pdfPages.map(p => p.dataUrl) : [], // 🆕 every real rendered page
        pageCount: file.type === 'application/pdf' ? pdfPages.length : 0, // 🆕
        pdfRawData: file.type === 'application/pdf' ? pdfRawDataUrl : null, // 🆕 for metadata forensics
        originalFileSize: file.size,
        originalHash: originalHash,
        notifiedApproved: false,
        notifiedRejected: false,
        stored: false,
        reason: "",
        createdAt: Date.now()
      };

      console.log("📄 Document with hash saved:", {
        name: newDoc.name,
        hash: newDoc.originalHash,
        status: newDoc.status,
        pageCount: newDoc.pageCount
      });

      let allDocs = JSON.parse(localStorage.getItem("documents") || "[]");
      allDocs.push(newDoc);
      allDocs = cleanupOldDocuments(allDocs);
      
      safeSetStorage("documents", allDocs);
      
      const updatedUserDocs = allDocs.filter(d => d.user === user);
      setLocalDocs(updatedUserDocs);

      const authorityKey = `authorityDocs_${selectedAuthority}`;
      let authDocs = JSON.parse(localStorage.getItem(authorityKey) || "[]");
      authDocs.push(newDoc);
      safeSetStorage(authorityKey, cleanupOldDocuments(authDocs));

      const authNotifKey = `authorityNotifications_${selectedAuthority}`;
      let authNotifs = JSON.parse(localStorage.getItem(authNotifKey) || "[]");
      authNotifs.push({
        id: Date.now(),
        message: `📄 New document from ${user}: ${file.name}`,
        type: "new_document",
        timestamp: new Date().toISOString(),
        docId: newDoc.id
      });
      safeSetStorage(authNotifKey, authNotifs.slice(-20));

      setShowModal(false);
      setFile(null);
      setFilePreview(null);
      setPdfPages([]);          // 🆕 reset
      setPdfRawDataUrl(null);   // 🆕 reset
      setSelectedAuthority("");

      addNotification(
        `✅ Document sent to ${selectedAuthority}! 🕐 Status: PENDING\nHash: ${originalHash.slice(0, 16)}...\n📸 High Quality Preview`,
        "success"
      );
      
    } catch (error) {
      console.error("❌ Send error:", error);
      addNotification("❌ Send failed: " + error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 ✅ STEP 2 FIXED: storeOnBlockchain - HASH CHECK + USE
  const storeOnBlockchain = async (doc) => {
    if (doc.status !== "Approved" || doc.stored) {
      addNotification("⚠️ Only APPROVED documents allowed!", "warning");
      return;
    }

    const hash = doc.originalHash;
    console.log("🔍 Checking hash for doc:", doc.name);
    console.log("📋 Document hash:", hash);

    if (!hash) {
      console.error("❌ NO HASH FOUND IN DOCUMENT:", doc);
      addNotification("❌ Hash missing! Please upload document again", "error");
      return;
    }

    setLoadingDocId(doc.id);

    try {
      console.log("🚀 USING ORIGINAL HASH:", hash);
      
      await registerHash(hash);
      console.log("✅ Blockchain transaction successful");

      let allDocs = JSON.parse(localStorage.getItem("documents") || "[]");

      const updatedDocs = allDocs.map(d =>
        d.id === doc.id
          ? {
              ...d,
              stored: true,
              blockchainHash: hash,
              blockchainTimestamp: new Date().toISOString()
            }
          : d
      );

      localStorage.setItem("documents", JSON.stringify(updatedDocs));
      setLocalDocs(updatedDocs.filter(d => d.user === user));

      console.log("✅ FINAL SUCCESS - Stored on blockchain:", {
        docName: doc.name,
        hash: hash,
        blockchainHash: hash
      });

      addNotification(`✅ ${doc.name} stored on blockchain! ⛓️`, "success");

    } catch (err) {
      console.error("❌ Blockchain error:", err);
      addNotification("❌ Blockchain failed: " + err.message, "error");
    }

    setLoadingDocId(null);
  };

  const handleMoreMenu = (e, doc) => {
    e.stopPropagation();
    if (showMoreMenu?.docId === doc.id) {
      setShowMoreMenu(null);
    } else {
      setShowMoreMenu({ docId: doc.id, x: e.clientX, y: e.clientY });
    }
  };

  const handleDownload = (doc) => {
    const link = document.createElement('a');
    if (doc.thumbnailData) {
      link.href = doc.thumbnailData;
      link.download = `${doc.name}_thumbnail.jpg`;
    } else {
      link.href = '#';
      link.download = doc.name;
    }
    link.click();
    setShowMoreMenu(null);
    addNotification(`📥 Downloaded: ${doc.name}`, "info");
  };

  const handleShare = (doc) => {
    if (navigator.share) {
      navigator.share({
        title: `Document: ${doc.name}`,
        text: `Status: ${doc.status} from ${doc.authority}`,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(`${doc.name} - ${doc.status} (${doc.authority})`);
      addNotification("📋 Link copied to clipboard!", "info");
    }
    setShowMoreMenu(null);
  };

  const openPreview = (doc) => {
    const previewData = doc.previewData || doc.thumbnailData || doc.fileData;
    setShowPreviewModal({ ...doc, previewData });
    setShowMoreMenu(null);
  };

  const getStatusColor = (status) => ({
    'Approved': '#10b981',
    'Rejected': '#ef4444', 
    'Pending': '#f59e0b',
    'Processing': '#3b82f6'
  }[status] || '#6b7280');

  const AnalyticsPanel = () => (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '20px', marginBottom: '25px', padding: '25px',
      background: '#1f2937', borderRadius: '16px', border: '1px solid #374151'
    }}>
      {[
        { icon: CheckCircle, label: 'Approved', count: localDocs.filter(d => d.status === 'Approved').length, color: '#10b981' },
        { icon: AlertCircle, label: 'Rejected', count: localDocs.filter(d => d.status === 'Rejected').length, color: '#ef4444' },
        { icon: Clock, label: 'Pending', count: localDocs.filter(d => d.status === 'Pending').length, color: '#f59e0b' },
        { icon: Shield, label: 'Blockchain', count: localDocs.filter(d => d.stored).length, color: '#3b82f6' }
      ].map(({ icon: Icon, label, count, color }, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '15px', padding: '20px',
          background: `${color}20`, borderRadius: '12px', border: `1px solid ${color}40`
        }}>
          <div style={{ padding: '12px', background: color, borderRadius: '10px' }}>
            <Icon size={24} color="white" />
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{count}</div>
            <div style={{ color: '#9ca3af', fontSize: '14px' }}>{label}</div>
          </div>
        </div>
      ))}
    </div>
  );

  const NotificationPanel = () => (
    <div style={{
      position: 'fixed', top: '20px', right: '20px', 
      width: 'clamp(320px, 35vw, 420px)',
      maxHeight: '80vh',
      background: '#1f2937', borderRadius: '16px', border: '1px solid #374151',
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', zIndex: 10000,
      overflow: 'hidden', display: showNotifications ? 'block' : 'none'
    }}>
      <div style={{
        padding: '20px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>🔔 Notifications</div>
          <div style={{ 
            background: notifications.length ? '#ef4444' : '#10b981', 
            color: 'white', padding: '4px 8px', borderRadius: '20px', 
            fontSize: '12px', fontWeight: 'bold' 
          }}>
            {notifications.length}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => {
              setNotifications([]);
              addNotification("🔔 All notifications cleared!", "info");
            }}
            style={{ 
              padding: '6px 12px', background: '#6b7280', color: 'white',
              border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Clear
          </button>
          <button onClick={() => setShowNotifications(false)} style={{ 
            color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' 
          }}>
            <X size={24} />
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 'calc(80vh - 90px)', overflowY: 'auto' }}>
        {notifications.map(notif => (
          <div key={notif.id} style={{
            padding: '16px 20px', borderBottom: '1px solid #374151',
            background: notif.type === 'success' ? '#10b98120' : 
                       notif.type === 'error' ? '#ef444420' : '#3b82f620',
            transition: 'all 0.3s ease', cursor: 'pointer'
          }}
          onClick={() => {
            const newNotifications = notifications.filter(n => n.id !== notif.id);
            setNotifications(newNotifications);
          }}
          >
            <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
              {notif.message}
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
              {notif.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        {notifications.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <CheckCircle size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
            <div style={{ fontSize: '16px', marginBottom: '8px', color: '#fff' }}>No notifications</div>
            <div style={{ fontSize: '13px' }}>All caught up! 🎉</div>
          </div>
        )}
      </div>
    </div>
  );

  const MoreMenu = ({ doc }) => (
    <div style={{
      position: 'fixed', left: showMoreMenu.x, top: showMoreMenu.y,
      background: '#1f2937', borderRadius: '12px', border: '1px solid #374151',
      boxShadow: '0 20px 40px rgba(0,0,0,0.4)', zIndex: 10001,
      minWidth: '160px', padding: '8px 0'
    }}>
      <button 
        onClick={() => { openPreview(doc); setShowMoreMenu(null); }}
        style={{
          width: '100%', padding: '12px 16px', background: 'none', border: 'none',
          color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '14px',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}
      >
        <Eye size={16} />
        Preview
      </button>
      <button 
        onClick={() => handleDownload(doc)}
        style={{
          width: '100%', padding: '12px 16px', background: 'none', border: 'none',
          color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '14px',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}
      >
        <DownloadIcon size={16} />
        Download
      </button>
      <button 
        onClick={() => handleShare(doc)}
        style={{
          width: '100%', padding: '12px 16px', background: 'none', border: 'none',
          color: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '14px',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}
      >
        <Share size={16} />
        Share
      </button>
      {doc.stored && (
        <div style={{
          width: '100%', padding: '12px 16px', color: '#10b981', fontSize: '14px',
          fontWeight: '500', background: '#10b98120', border: 'none', cursor: 'default'
        }}>
          ✅ On Blockchain
        </div>
      )}
    </div>
  );

  return (
    <div style={{
      maxWidth: '1400px', margin: '0 auto', padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', minHeight: '100vh'
    }}>
      <NotificationPanel />

      {showMoreMenu && filteredDocs.find(doc => doc.id === showMoreMenu.docId) && (
        <MoreMenu doc={filteredDocs.find(doc => doc.id === showMoreMenu.docId)} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '32px' }}>👤 {user}'s Dashboard</h2>
          <div style={{ color: '#94a3b8', fontSize: '15px' }}>
            {localDocs.length} documents • Images ready for authorities
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={cleanLocalStorage}
            style={{
              display: 'flex', gap: '6px', padding: '10px 14px',
              background: storageQuota.isLow ? '#ef4444' : '#6b7280', color: 'white',
              border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
            }}
            title="🧹 Clean Storage (Safe)"
          >
            <Trash2 size={16} />
            Clean
          </button>
          
          <div style={{
            padding: '8px 12px', background: storageQuota.isLow ? '#fef3c7' : '#10b98120',
            borderRadius: '20px', fontSize: '13px', color: storageQuota.isLow ? '#92400e' : '#10b981',
            fontWeight: '500'
          }}>
            💾 {Math.round(storageQuota.availableMB * 10)/10}MB free
          </div>
          
          <button 
            onClick={() => {
              if (showNotifications) {
                setNotifications([]);
                addNotification("🔔 Notifications cleared! ✅", "success");
              }
              setShowNotifications(!showNotifications);
            }} 
            style={{
              display: 'flex', gap: '8px', padding: '12px 18px',
              background: notifications.length > 0 ? '#ef4444' : '#374151', 
              color: 'white', border: 'none', borderRadius: '10px', 
              cursor: 'pointer', fontWeight: '600', position: 'relative',
              boxShadow: notifications.length > 0 ? '0 0 0 3px rgba(239,68,68,0.3)' : 'none'
            }}
            title={`${notifications.length} new notifications`}
          >
            🔔 
            {notifications.length > 0 && (
              <div style={{
                background: '#fff', color: '#ef4444', width: '20px', height: '20px',
                borderRadius: '50%', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', fontSize: '11px', fontWeight: 'bold',
                position: 'absolute', top: '-4px', right: '-4px'
              }}>
                {notifications.length > 99 ? '99+' : notifications.length}
              </div>
            )}
            <span style={{ fontSize: '14px' }}>{notifications.length || 0}</span>
          </button>
          
          <button 
            onClick={() => setShowAnalytics(!showAnalytics)}
            style={{
              display: 'flex', gap: '8px', padding: '12px 18px',
              background: showAnalytics ? '#10b981' : '#374151', color: 'white',
              border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600'
            }}
          >
            <BarChart3 size={20} />
            Analytics
          </button>
        </div>
      </div>

      {storageQuota.isLow && (
        <div style={{
          background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px',
          padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <AlertCircle size={20} color="#d97706" />
          <div>
            <strong>💾 Low Storage</strong> - {Math.round(storageQuota.availableMB * 10)/10}MB left. 
            <button onClick={cleanLocalStorage} style={{
              marginLeft: '12px', padding: '6px 12px', background: '#f59e0b', 
              color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
            }}>
              🧹 Clean Now
            </button>
          </div>
        </div>
      )}

      {isBlocked && (
        <div style={{
          background: '#fee2e2', border: '2px solid #f87171', borderRadius: '12px',
          padding: '20px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '15px'
        }}>
          <AlertCircle size={32} color="#dc2626" />
          <div>
            <strong style={{ color: '#dc2626', fontSize: '18px' }}>🚫 UPLOAD BLOCKED</strong>
            <div style={{ color: '#991b1b', marginTop: '4px' }}>3+ rejections detected. Contact authority to unblock.</div>
          </div>
        </div>
      )}

      <div style={{ 
        background: '#1f2937', padding: '25px', borderRadius: '16px', marginBottom: '25px',
        border: isBlocked ? '2px dashed #f87171' : '2px dashed #4b5563',
        position: 'relative'
      }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '16px', zIndex: 10
          }}>
            <Loader size={48} className="animate-spin" color="#10b981" />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <label htmlFor="file-input" style={{
              display: 'block', padding: '15px', background: '#111827', color: '#fff', 
              border: isBlocked ? '2px dashed #f87171' : '2px dashed #4b5563',
              borderRadius: '12px', fontSize: '16px', textAlign: 'center', cursor: isBlocked ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}>
              {isBlocked ? '🚫 Upload Blocked' : '📁 Choose Image/PDF'}
            </label>
            <input 
              type="file" 
              id="file-input" 
              accept="image/*,application/pdf"
              onChange={handleFile} 
              disabled={isBlocked || loading}
              style={{ display: 'none' }}
            />
          </div>
          {filePreview && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '120px', height: '120px', borderRadius: '12px', 
                border: '3px solid #10b981', overflow: 'hidden', background: '#111827'
              }}>
                <img src={filePreview} alt="Preview" style={{
                  width: '100%', height: '100%', objectFit: 'cover'
                }} />
              </div>
              <div style={{ color: '#10b981', marginTop: '8px', fontSize: '14px', fontWeight: '500' }}>
                {pdfPages.length > 1 ? `✅ ${pdfPages.length} pages rendered` : '✅ High Quality Preview'}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAnalytics && <AnalyticsPanel />}

      <div style={{ 
        display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap', alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search size={20} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input 
            type="text" 
            placeholder="🔍 Search documents..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            style={{
              padding: '12px 18px 12px 45px', background: '#1f2937', color: '#fff', 
              border: '1px solid #4b5563', borderRadius: '10px', width: '100%',
              fontSize: '14px'
            }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <Filter size={20} style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              padding: '12px 18px 12px 40px', background: '#1f2937', color: '#fff', 
              border: '1px solid #4b5563', borderRadius: '10px'
            }}
          >
            <option value="all">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Processing">Processing</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', background: '#1f2937', padding: '8px 12px', borderRadius: '8px', border: '1px solid #4b5563' }}>
          <span style={{ color: '#9ca3af', fontSize: '14px' }}>Sort:</span>
          <select 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value)}
            style={{ background: 'none', color: '#fff', border: 'none', fontSize: '14px' }}
          >
            <option value="sentAt">Date</option>
            <option value="name">Name</option>
            <option value="authority">Authority</option>
            <option value="status">Status</option>
          </select>
          <button 
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            {sortOrder === 'desc' ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button 
            onClick={() => {
              loadUserDocs();
              addNotification("🔄 Table refreshed!", "info");
            }} 
            style={{
              display: 'flex', gap: '8px', padding: '12px 20px',
              background: '#10b981', color: 'white', border: 'none', 
              borderRadius: '10px', cursor: 'pointer', fontWeight: '500'
            }}
          >
            <RefreshCw size={18} />
            Refresh ({localDocs.length})
          </button>
        </div>
      </div>

      <div style={{
        background: '#1f2937', borderRadius: '16px', overflow: 'hidden',
        border: '1px solid #374151', boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          padding: '20px 25px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          borderBottom: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '20px', fontWeight: '600' }}>
            📋 Your Documents ({filteredDocs.length} / {localDocs.length} total)
          </h3>
          <DocumentStats documents={localDocs} />
        </div>
        
        <div style={{ maxHeight: '600px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#111827' }}>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#9ca3af', fontSize: '14px', fontWeight: '500' }}>Document</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#9ca3af', fontSize: '14px', fontWeight: '500' }}>Authority</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#9ca3af', fontSize: '14px', fontWeight: '500' }}>Status</th>
                <th style={{ padding: '16px 20px', textAlign: 'left', color: '#9ca3af', fontSize: '14px', fontWeight: '500' }}>Date</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', fontWeight: '500' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => (
                <tr key={doc.id} style={{
                  borderBottom: '1px solid #374151',
                  background: localDocs.findIndex(d => d.id === doc.id) % 2 ? '#1a1f2b' : 'transparent'
                }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '8px', 
                        background: doc.fileType?.startsWith('image/') ? '#3b82f6' : '#10b981',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {doc.fileType?.startsWith('image/') ? <ImageIcon size={20} color="white" /> : <FileText size={20} color="white" />}
                      </div>
                      <div>
                        <div style={{ color: '#fff', fontWeight: '500', fontSize: '15px' }}>{doc.name}</div>
                        <div style={{ color: '#9ca3af', fontSize: '13px' }}>
                          {doc.fileSize}KB{doc.pageCount > 0 ? ` • ${doc.pageCount} pages` : ''}
                        </div>
                        {doc.originalHash && (
                          <div style={{ fontSize: '10px', color: '#10b981', fontFamily: 'monospace' }}>
                            {doc.originalHash.slice(0, 8)}...
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', color: '#e5e7eb' }}>
                    {doc.authority}
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{
                      padding: '6px 12px', background: `${getStatusColor(doc.status)}20`,
                      color: getStatusColor(doc.status), borderRadius: '20px', 
                      fontSize: '13px', fontWeight: '600', border: `1px solid ${getStatusColor(doc.status)}40`
                    }}>
                      {doc.status}
                    </span>
                    {doc.reason && (
                      <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px' }}>
                        {doc.reason}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '16px 20px', color: '#9ca3af', fontSize: '13px' }}>
                    {doc.sentAt ? new Date(doc.sentAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                      <button 
                        onClick={() => openPreview(doc)}
                        style={{
                          padding: '8px', background: 'none', border: 'none', 
                          color: '#60a5fa', cursor: 'pointer', borderRadius: '6px',
                          display: 'flex', alignItems: 'center'
                        }}
                        title="Preview"
                      >
                        <Eye size={18} />
                      </button>
                      
                      {doc.status === "Approved" && !doc.stored && doc.originalHash ? (
                        <button 
                          onClick={() => storeOnBlockchain(doc)}
                          disabled={loadingDocId === doc.id}
                          style={{
                            padding: '8px 12px', 
                            background: loadingDocId === doc.id ? '#6b7280' : '#3b82f6', 
                            color: 'white', border: 'none', borderRadius: '6px', 
                            fontSize: '12px', fontWeight: '500', 
                            cursor: loadingDocId === doc.id ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                          title={`Store ${doc.name} on blockchain (Hash: ${doc.originalHash?.slice(0,10)}...)`}
                        >
                          {loadingDocId === doc.id ? (
                            <Loader size={14} className="animate-spin" />
                          ) : (
                            <Shield size={16} />
                          )}
                          Blockchain
                        </button>
                      ) : doc.status === "Approved" && !doc.originalHash ? (
                        <span style={{ 
                          color: '#ef4444', fontSize: '11px', fontWeight: '500'
                        }}>
                          ❌ No Hash
                        </span>
                      ) : null}
                      
                      {doc.stored && (
                        <span style={{ 
                          color: '#10b981', fontSize: '12px', fontWeight: '600',
                          display: 'flex', alignItems: 'center', gap: '4px'
                        }}>
                          <Shield size={16} />
                          Stored ⛓️
                        </span>
                      )}
                      
                      <button 
                        onClick={(e) => handleMoreMenu(e, doc)}
                        style={{
                          padding: '8px', background: 'none', border: 'none', 
                          color: '#9ca3af', cursor: 'pointer', borderRadius: '6px'
                        }}
                        title="More options"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredDocs.length === 0 && (
            <div style={{
              padding: '60px 40px', textAlign: 'center', color: '#9ca3af'
            }}>
              <FileText size={64} style={{ margin: '0 auto 20px', opacity: 0.5 }} />
              <h3 style={{ margin: '0 0 10px 0', color: '#fff' }}>No documents found</h3>
              <p>Upload your first document or adjust your filters</p>
            </div>
          )}
        </div>
      </div>

      {/* 🗂️ Authority Selection Modal */}
      {showModal && !isBlocked && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 9999, backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            width: '450px', maxHeight: '90vh', padding: '30px', background: '#1a1a1a',
            borderRadius: '20px', border: '1px solid #374151', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '24px' }}>📤 Send Document</h3>
              <button onClick={() => {setShowModal(false); setFile(null); setPdfPages([]); setPdfRawDataUrl(null);}} style={{ color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={28} />
              </button>
            </div>
            
            {file && (
              <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                <img src={filePreview} alt="Preview" style={{
                  maxWidth: '200px', maxHeight: '200px', borderRadius: '12px', 
                  border: '3px solid #10b981', boxShadow: '0 10px 25px rgba(16,185,129,0.3)'
                }} />
                <div style={{ color: '#10b981', marginTop: '12px', fontSize: '16px', fontWeight: '600' }}>
                  {file.name}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
                  📏 {Math.round((filePreview?.length || 0) * 0.75 / 1024)}KB High Quality
                  {pdfPages.length > 1 ? ` • 📄 ${pdfPages.length} pages` : ''}
                </div>

                {pdfPages.length > 1 && (
                  <div style={{
                    display: 'flex', gap: '8px', marginTop: '14px', overflowX: 'auto',
                    padding: '8px', justifyContent: 'center'
                  }}>
                    {pdfPages.slice(0, 6).map((p) => (
                      <img key={p.pageNumber} src={p.dataUrl} alt={`Page ${p.pageNumber}`}
                        style={{ width: '50px', height: '65px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #374151' }} />
                    ))}
                    {pdfPages.length > 6 && (
                      <div style={{ color: '#9ca3af', fontSize: '12px', alignSelf: 'center' }}>+{pdfPages.length - 6} more</div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>
                Select Authority
              </label>
              <select
                value={selectedAuthority}
                onChange={(e) => setSelectedAuthority(e.target.value)}
                style={{
                  width: '100%', padding: '15px 20px', background: '#1f2937', color: '#fff',
                  border: '2px solid #4b5563', borderRadius: '12px', fontSize: '16px'
                }}
              >
                <option value="">Choose authority...</option>
                {authorities.map((auth, i) => (
                  <option key={i} value={auth.name}>{auth.emoji} {auth.name}</option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={sendToAuthority}
                disabled={!selectedAuthority || loading}
                style={{
                  flex: 1, padding: '16px', background: selectedAuthority ? '#10b981' : '#4b5563',
                  color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600',
                  cursor: selectedAuthority ? 'pointer' : 'not-allowed'
                }}
              >
                {loading ? <Loader size={20} className="animate-spin" /> : '🚀 Send Document'}
              </button>
              <button 
                onClick={() => {setShowModal(false); setFile(null); setFilePreview(null); setPdfPages([]); setPdfRawDataUrl(null); setSelectedAuthority("");}}
                style={{
                  padding: '16px', background: '#4b5563', color: 'white', border: 'none',
                  borderRadius: '12px', fontSize: '16px', fontWeight: '500', cursor: 'pointer', flex: 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👁️ Preview Modal */}
      {showPreviewModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0,0,0,0.95)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 10001, backdropFilter: 'blur(12px)'
        }}>
          <div style={{
            maxWidth: '90vw', maxHeight: '90vh', background: '#1a1a1a',
            borderRadius: '24px', overflow: 'hidden', border: '2px solid #374151',
            boxShadow: '0 50px 100px rgba(0,0,0,0.9)', position: 'relative'
          }}>
            <div style={{
              padding: '25px 30px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, zIndex: 10
            }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', color: '#fff', fontSize: '24px' }}>
                  👁️ Document Preview
                </h3>
                <div style={{ color: '#9ca3af', fontSize: '15px' }}>
                  {showPreviewModal.authority} • {showPreviewModal.status}
                  {showPreviewModal.stored && ' • ⛓️ On Blockchain'}
                </div>
              </div>
              <button 
                onClick={() => setShowPreviewModal(null)}
                style={{
                  width: '44px', height: '44px', background: '#ef4444', color: 'white',
                  border: 'none', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <X size={24} />
              </button>
            </div>
            
            <div style={{ padding: '30px', maxHeight: '70vh', overflow: 'auto' }}>
              {(showPreviewModal.previewData || showPreviewModal.thumbnailData) && (
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                  <img 
                    src={showPreviewModal.previewData || showPreviewModal.thumbnailData} 
                    alt="Full Preview" 
                    style={{
                      maxWidth: '100%', maxHeight: '500px', borderRadius: '20px',
                      border: '3px solid #10b981', boxShadow: '0 25px 50px rgba(16,185,129,0.3)'
                    }}
                  />
                  <div style={{ 
                    marginTop: '20px', padding: '16px 24px', background: '#1f2937',
                    borderRadius: '12px', display: 'inline-block', color: '#10b981', fontSize: '16px'
                  }}>
                    📄 {showPreviewModal.name} ({showPreviewModal.fileSize}KB)
                    {showPreviewModal.previewData && ' • 🔥 High Quality'}
                    {showPreviewModal.pageCount > 0 && ` • ${showPreviewModal.pageCount} pages`}
                  </div>
                </div>
              )}

              {showPreviewModal.pages && showPreviewModal.pages.length > 1 && (
                <div style={{ marginBottom: '30px' }}>
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '10px', fontWeight: '500' }}>
                    All Pages ({showPreviewModal.pages.length})
                  </div>
                  <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '4px' }}>
                    {showPreviewModal.pages.map((p, i) => (
                      <img key={i} src={p} alt={`Page ${i + 1}`}
                        style={{ width: '90px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #374151' }} />
                    ))}
                  </div>
                </div>
              )}
              
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '24px', padding: '25px', background: '#111827', borderRadius: '16px'
              }}>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>Status</div>
                  <div style={{
                    padding: '12px 20px', background: `${getStatusColor(showPreviewModal.status)}25`,
                    color: getStatusColor(showPreviewModal.status), borderRadius: '30px',
                    fontWeight: '700', fontSize: '18px', display: 'inline-block',
                    border: `2px solid ${getStatusColor(showPreviewModal.status)}50`
                  }}>
                    {showPreviewModal.status}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>Authority</div>
                  <div style={{ color: '#fff', fontWeight: '700', fontSize: '20px' }}>
                    {showPreviewModal.authority}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>Sent</div>
                  <div style={{ color: '#e5e7eb', fontSize: '16px' }}>
                    {showPreviewModal.sentAt ? new Date(showPreviewModal.sentAt).toLocaleString() : 'N/A'}
                  </div>
                </div>
                {showPreviewModal.originalHash && (
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>Document Hash</div>
                    <div style={{ 
                      color: '#3b82f6', fontSize: '14px', fontWeight: '600',
                      fontFamily: 'monospace', wordBreak: 'break-all',
                      background: '#1f2937', padding: '8px 12px', borderRadius: '8px'
                    }}>
                      {showPreviewModal.originalHash}
                    </div>
                  </div>
                )}
                {showPreviewModal.stored && (
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px', fontWeight: '500' }}>Blockchain</div>
                    <div style={{ 
                      color: '#10b981', fontSize: '16px', fontWeight: '700',
                      display: 'flex', flexDirection: 'column', gap: '4px'
                    }}>
                      ✅ Stored Successfully
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>
                        Hash: {showPreviewModal.blockchainHash?.slice(0, 12)}...
                      </div>
                    </div>
                  </div>
                )}
                {showPreviewModal.reason && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '12px', fontWeight: '500' }}>Rejection Reason</div>
                    <div style={{
                      padding: '16px 20px', background: '#ef444420', border: '2px solid #ef444440',
                      borderRadius: '12px', color: '#f87171', fontSize: '15px', lineHeight: '1.5'
                    }}>
                      {showPreviewModal.reason}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div style={{
              padding: '25px 30px', borderTop: '2px solid #374151',
              background: '#1a1a1a', display: 'flex', gap: '16px', justifyContent: 'flex-end',
              position: 'sticky', bottom: 0
            }}>
              {showPreviewModal.stored && (
                <button 
                  style={{
                    padding: '14px 28px', background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', 
                    cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(showPreviewModal.blockchainHash);
                    addNotification("📋 Blockchain Hash copied!", "success");
                  }}
                >
                  <Copy size={20} />
                  Copy Hash
                </button>
              )}
              {showPreviewModal.originalHash && (
                <button 
                  style={{
                    padding: '14px 28px', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    color: 'white', border: 'none', borderRadius: '12px', fontWeight: '700', 
                    cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(showPreviewModal.originalHash);
                    addNotification("📋 Document Hash copied!", "success");
                  }}
                >
                  <Copy size={20} />
                  Copy Doc Hash
                </button>
              )}
              <button 
                onClick={() => setShowPreviewModal(null)}
                style={{
                  padding: '14px 28px', background: '#4b5563', color: 'white',
                  border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        button:hover {
          transform: translateY(-1px);
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  );
}

export default UserDashboard;