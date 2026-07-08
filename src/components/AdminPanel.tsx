import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Lock,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Edit2,
  FileText,
  Mail,
  Phone,
  Instagram,
  MapPin,
  Save,
  Undo,
  Link as LinkIcon,
  Check,
  Eye,
  Upload,
  AlertCircle,
  Cloud,
  Loader2
} from "lucide-react";
import { PortfolioItem, ContactInfo, PortfolioSettings } from "../types";
import { savePDF, getPDF, deletePDF, saveMediaFile, getMediaFile, deleteMediaFile, useMediaUrl } from "../pdfStorage";
import { ResolvedImage } from "./ResolvedImage";
import { uploadToStorage, deleteFromStorage, syncStorageUrlsToFirestore, syncPdfUrlToFirestore } from "../firebase";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioItems: PortfolioItem[];
  contactInfo: ContactInfo;
  portfolioSettings: PortfolioSettings;
  onUpdateItems: (items: PortfolioItem[]) => Promise<void> | void;
  onUpdateContact: (contact: ContactInfo) => Promise<void> | void;
  onUpdateSettings: (settings: PortfolioSettings) => Promise<void> | void;
}

export default function AdminPanel({
  isOpen,
  onClose,
  portfolioItems,
  contactInfo,
  portfolioSettings,
  onUpdateItems,
  onUpdateContact,
  onUpdateSettings,
}: AdminPanelProps) {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Cloud migration states
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState("");

  // Storage Auto-Sync state and action
  const [isSyncingStorage, setIsSyncingStorage] = useState(false);

  const handleAutoSyncStorage = async (silent = false) => {
    if (isSyncingStorage) return;
    setIsSyncingStorage(true);
    try {
      const { updatedItems, count: itemCount } = await syncStorageUrlsToFirestore(
        portfolioItems,
        async (items) => {
          await onUpdateItems(items);
        }
      );

      const { changed: pdfChanged } = await syncPdfUrlToFirestore(
        portfolioSettings,
        async (settings) => {
          await onUpdateSettings(settings);
        }
      );

      if (!silent) {
        if (itemCount > 0 || pdfChanged) {
          triggerSaveNotification(`🎉 클라우드 저장소 파일 연동 완료! 총 ${itemCount}개의 파일 링크가 자동으로 갱신되었습니다.`);
        } else {
          triggerSaveNotification(`이미 모든 저장소 파일들과 완벽히 연동되어 있습니다.`);
        }
      }
    } catch (err) {
      console.error(err);
      if (!silent) {
        alert("저장소 파일 자동 연동 중 오류가 발생했습니다.");
      }
    } finally {
      setIsSyncingStorage(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      // Trigger auto sync seamlessly upon login!
      handleAutoSyncStorage(true).catch(console.error);
    }
  }, [isAuthenticated]);

  const hasLocalAssets = useMemo(() => {
    const hasLocalPdf = portfolioSettings.pdfUrl === "local_indexeddb" || (portfolioSettings.pdfUrl && portfolioSettings.pdfUrl.startsWith("indexeddb:"));
    const hasLocalItem = portfolioItems.some(
      (item) => (item.thumbnailUrl && item.thumbnailUrl.startsWith("indexeddb:")) || (item.videoUrl && item.videoUrl.startsWith("indexeddb:"))
    );
    return hasLocalPdf || hasLocalItem;
  }, [portfolioSettings, portfolioItems]);

  const handleCloudMigration = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    setMigrationStatus("클라우드 마이그레이션 분석 중...");
    try {
      let updatedSettings = { ...portfolioSettings };
      const isPdfLocal = portfolioSettings.pdfUrl === "local_indexeddb" || (portfolioSettings.pdfUrl && portfolioSettings.pdfUrl.startsWith("indexeddb:"));
      
      if (isPdfLocal) {
        setMigrationStatus("포트폴리오 PDF 파일 클라우드 전송 중...");
        const pdfFile = await getPDF();
        if (pdfFile) {
          const downloadUrl = await uploadToStorage(`pdf/${pdfFile.name}`, pdfFile);
          updatedSettings = {
            ...updatedSettings,
            pdfUrl: downloadUrl,
          };
          onUpdateSettings(updatedSettings);
        }
      }

      const updatedItems = [...portfolioItems];
      for (let i = 0; i < updatedItems.length; i++) {
        const item = { ...updatedItems[i] };
        let itemChanged = false;

        if (item.thumbnailUrl && item.thumbnailUrl.startsWith("indexeddb:")) {
          const key = item.thumbnailUrl.replace("indexeddb:", "");
          setMigrationStatus(`[${i + 1}/${updatedItems.length}] ${item.title} 썸네일 업로드 중...`);
          const file = await getMediaFile(key);
          if (file) {
            const downloadUrl = await uploadToStorage(`thumbnails/${item.id}_${file.name}`, file);
            item.thumbnailUrl = downloadUrl;
            itemChanged = true;
          }
        }

        if (item.videoUrl && item.videoUrl.startsWith("indexeddb:")) {
          const key = item.videoUrl.replace("indexeddb:", "");
          setMigrationStatus(`[${i + 1}/${updatedItems.length}] ${item.title} 동영상 업로드 중...`);
          const file = await getMediaFile(key);
          if (file) {
            const downloadUrl = await uploadToStorage(`videos/${item.id}_${file.name}`, file);
            item.videoUrl = downloadUrl;
            itemChanged = true;
          }
        }

        if (itemChanged) {
          updatedItems[i] = item;
        }
      }

      setMigrationStatus("클라우드 데이터베이스 최신화 중...");
      await onUpdateItems(updatedItems);
      
      triggerSaveNotification("모든 자산이 클라우드로 완벽히 전송 및 연동되었습니다! 🎉");
      setMigrationStatus("");
    } catch (err) {
      console.error("Migration failed:", err);
      alert("마이그레이션 중 오류가 발생했습니다: " + (err as Error).message);
    } finally {
      setIsMigrating(false);
    }
  };

  // Managing items edit state
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Temporary forms state
  const [itemForm, setItemForm] = useState<Partial<PortfolioItem>>({
    title: "",
    client: "",
    videoUrl: "",
    thumbnailUrl: "",
    year: "2026",
    description: "",
  });

  const [contactForm, setContactForm] = useState<ContactInfo>({ ...contactInfo });
  const [settingsForm, setSettingsForm] = useState<PortfolioSettings>({ ...portfolioSettings });
  const [savedMessage, setSavedMessage] = useState("");

  // Sync props to state if they change
  useEffect(() => {
    setSettingsForm(portfolioSettings);
    if (portfolioSettings.pdfFileName) {
      setUploadedFileName(portfolioSettings.pdfFileName);
    }
  }, [portfolioSettings]);

  useEffect(() => {
    setContactForm(contactInfo);
  }, [contactInfo]);

  // File upload state & handlers
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(portfolioSettings.pdfFileName || null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const thumbFileInputRef = useRef<HTMLInputElement>(null);
  const [videoUploadProgress, setVideoUploadProgress] = useState<string | null>(null);
  const [thumbUploadProgress, setThumbUploadProgress] = useState<string | null>(null);

  // Directly upload from list state
  const [activeUploadItemId, setActiveUploadItemId] = useState<string | null>(null);
  const [uploadProgressMap, setUploadProgressMap] = useState<{[key: string]: string}>({});

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("비디오 파일만 업로드할 수 있습니다.");
      return;
    }

    const targetId = activeUploadItemId || itemForm.id || (editingItem ? editingItem.id : null);
    if (!targetId) {
      alert("작업물 ID가 생성되지 않았습니다.");
      return;
    }

    try {
      setUploadProgressMap(prev => ({ ...prev, [`video-${targetId}`]: "업로드 중..." }));
      setVideoUploadProgress("업로드 중...");
      
      const downloadUrl = await uploadToStorage(`videos/${targetId}_${file.name}`, file);
      
      // Update the active form state if we are currently editing/creating this item in the form
      if (itemForm.id === targetId || (editingItem && editingItem.id === targetId)) {
        setItemForm((prev) => ({
          ...prev,
          videoUrl: downloadUrl
        }));
      }

      // If the item already exists in the list, update and save to Firestore immediately
      const itemExists = portfolioItems.some(item => item.id === targetId);
      if (itemExists) {
        const updated = portfolioItems.map((item) =>
          item.id === targetId ? { ...item, videoUrl: downloadUrl } : item
        );
        await onUpdateItems(updated);
      }

      setUploadProgressMap(prev => ({ ...prev, [`video-${targetId}`]: "완료" }));
      setVideoUploadProgress("완료");
      triggerSaveNotification(`동영상 파일이 클라우드에 성공적으로 업로드 및 연동되었습니다.`);
    } catch (err) {
      console.error(err);
      alert("동영상 업로드 중 오류가 발생했습니다.");
      setUploadProgressMap(prev => {
        const copy = { ...prev };
        delete copy[`video-${targetId}`];
        return copy;
      });
      setVideoUploadProgress(null);
    } finally {
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
      setActiveUploadItemId(null);
    }
  };

  const handleThumbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const targetId = activeUploadItemId || itemForm.id || (editingItem ? editingItem.id : null);
    if (!targetId) {
      alert("작업물 ID가 생성되지 않았습니다.");
      return;
    }

    try {
      setUploadProgressMap(prev => ({ ...prev, [`thumb-${targetId}`]: "업로드 중..." }));
      setThumbUploadProgress("업로드 중...");
      
      const downloadUrl = await uploadToStorage(`thumbnails/${targetId}_${file.name}`, file);
      
      // Update the active form state if we are currently editing/creating this item in the form
      if (itemForm.id === targetId || (editingItem && editingItem.id === targetId)) {
        setItemForm((prev) => ({
          ...prev,
          thumbnailUrl: downloadUrl
        }));
      }

      // If the item already exists in the list, update and save to Firestore immediately
      const itemExists = portfolioItems.some(item => item.id === targetId);
      if (itemExists) {
        const updated = portfolioItems.map((item) =>
          item.id === targetId ? { ...item, thumbnailUrl: downloadUrl } : item
        );
        await onUpdateItems(updated);
      }

      setUploadProgressMap(prev => ({ ...prev, [`thumb-${targetId}`]: "완료" }));
      setThumbUploadProgress("완료");
      triggerSaveNotification(`썸네일 파일이 클라우드에 성공적으로 업로드 및 연동되었습니다.`);
    } catch (err) {
      console.error(err);
      alert("썸네일 이미지 업로드 중 오류가 발생했습니다.");
      setUploadProgressMap(prev => {
        const copy = { ...prev };
        delete copy[`thumb-${targetId}`];
        return copy;
      });
      setThumbUploadProgress(null);
    } finally {
      if (thumbFileInputRef.current) thumbFileInputRef.current.value = "";
      setActiveUploadItemId(null);
    }
  };

  const checkUploadedFile = async () => {
    if (portfolioSettings.pdfFileName) {
      setUploadedFileName(portfolioSettings.pdfFileName);
    } else {
      setUploadedFileName(null);
    }
  };

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      checkUploadedFile();
    }
  }, [isOpen, isAuthenticated, portfolioSettings]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    try {
      setUploadedFileName("업로드 중...");
      const downloadUrl = await uploadToStorage(`pdf/${file.name}`, file);
      const updatedSettings = {
        ...settingsForm,
        pdfFileName: file.name,
        pdfUrl: downloadUrl,
      };
      setSettingsForm(updatedSettings);
      onUpdateSettings(updatedSettings);
      setUploadedFileName(file.name);
      triggerSaveNotification("포트폴리오 PDF 파일이 클라우드에 업로드되었습니다.");
    } catch (err) {
      console.error(err);
      alert("파일 업로드 중 오류가 발생했습니다.");
      setUploadedFileName(null);
    }
  };

  const handleFileDelete = async () => {
    if (confirm("정말로 업로드된 포트폴리오 PDF 파일을 삭제하시겠습니까?")) {
      try {
        if (settingsForm.pdfFileName) {
          await deleteFromStorage(`pdf/${settingsForm.pdfFileName}`);
        }
        setUploadedFileName(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        const updatedSettings = {
          ...settingsForm,
          pdfUrl: "",
          pdfFileName: "",
        };
        setSettingsForm(updatedSettings);
        onUpdateSettings(updatedSettings);
        triggerSaveNotification("업로드된 포트폴리오 PDF 파일이 삭제되었습니다.");
      } catch (err) {
        console.error(err);
        alert("파일 삭제 중 오류가 발생했습니다.");
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      alert("PDF 파일만 업로드할 수 있습니다.");
      return;
    }

    try {
      setUploadedFileName("업로드 중...");
      const downloadUrl = await uploadToStorage(`pdf/${file.name}`, file);
      const updatedSettings = {
        ...settingsForm,
        pdfFileName: file.name,
        pdfUrl: downloadUrl,
      };
      setSettingsForm(updatedSettings);
      onUpdateSettings(updatedSettings);
      setUploadedFileName(file.name);
      triggerSaveNotification("포트폴리오 PDF 파일이 클라우드에 업로드되었습니다.");
    } catch (err) {
      console.error(err);
      alert("파일 업로드 중 오류가 발생했습니다.");
      setUploadedFileName(null);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "0824") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("비밀번호가 일치하지 않습니다.");
    }
  };

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateContact(contactForm);
    triggerSaveNotification("연락처 정보가 저장되었습니다.");
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(settingsForm);
    triggerSaveNotification("포트폴리오 설정이 저장되었습니다.");
  };

  const triggerSaveNotification = (msg: string) => {
    setSavedMessage(msg);
    setTimeout(() => {
      setSavedMessage("");
    }, 3000);
  };

  // Item operations
  const startEditItem = (item: PortfolioItem) => {
    setEditingItem(item);
    setIsAddingNew(false);
    setItemForm({ ...item });
  };

  const startAddNewItem = () => {
    setIsAddingNew(true);
    setEditingItem(null);
    setItemForm({
      id: Date.now().toString(),
      title: `AI Commercial ${String(portfolioItems.length + 1).padStart(2, "0")}`,
      client: "",
      videoUrl: "",
      thumbnailUrl: "",
      year: "2026",
      description: "",
    });
  };

  const handleItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.title || !itemForm.client || !itemForm.videoUrl || !itemForm.thumbnailUrl) {
      alert("모든 필수 항목을 입력해 주세요.");
      return;
    }

    if (isAddingNew) {
      const newItem: PortfolioItem = {
        id: itemForm.id || Date.now().toString(),
        title: itemForm.title || "",
        client: itemForm.client || "",
        videoUrl: itemForm.videoUrl || "",
        thumbnailUrl: itemForm.thumbnailUrl || "",
        year: itemForm.year || "2026",
        description: itemForm.description || "",
        order: portfolioItems.length > 0 ? Math.max(...portfolioItems.map((i) => i.order)) + 1 : 1,
      };
      onUpdateItems([...portfolioItems, newItem]);
      setIsAddingNew(false);
      triggerSaveNotification("새 작업물이 추가되었습니다.");
    } else if (editingItem) {
      const updated = portfolioItems.map((item) =>
        item.id === editingItem.id ? { ...item, ...itemForm } as PortfolioItem : item
      );
      onUpdateItems(updated);
      setEditingItem(null);
      triggerSaveNotification("작업물이 수정되었습니다.");
    }
  };

  const handleDeleteItem = (id: string) => {
    if (confirm("정말로 이 작업물을 삭제하시겠습니까?")) {
      const filtered = portfolioItems.filter((item) => item.id !== id);
      // Re-index orders
      const ordered = filtered.map((item, index) => ({ ...item, order: index + 1 }));
      onUpdateItems(ordered);
      triggerSaveNotification("작업물이 삭제되었습니다.");
      
      // Clean up files in IndexedDB
      deleteMediaFile(`media_video_${id}`).catch(console.error);
      deleteMediaFile(`media_thumb_${id}`).catch(console.error);

      if (editingItem && editingItem.id === id) {
        setEditingItem(null);
      }
    }
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const newItems = [...portfolioItems].sort((a, b) => a.order - b.order);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newItems.length) return;

    // Swap orders
    const temp = newItems[index].order;
    newItems[index].order = newItems[targetIndex].order;
    newItems[targetIndex].order = temp;

    onUpdateItems(newItems);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black"
        id="admin-backdrop"
      />

      {/* Admin Panel Drawer */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col z-10 overflow-hidden border-l border-neutral-100"
        id="admin-drawer"
      >
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-neutral-900" />
            <h2 className="text-lg font-semibold font-display text-neutral-900">
              CHA CD 관리자 콘솔
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-neutral-900 rounded-full hover:bg-neutral-100 transition-colors"
            id="close-admin-button"
            aria-label="Close admin panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Alert Banner */}
        <AnimatePresence>
          {savedMessage && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 text-emerald-800 text-sm font-medium flex items-center gap-2"
            >
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {!isAuthenticated ? (
            /* Login Form - Styled with Artistic Flair */
            <div className="max-w-md mx-auto py-16 text-center space-y-6">
              <div className="w-12 h-12 bg-neutral-100 flex items-center justify-center mx-auto border border-neutral-200">
                <Lock className="w-4 h-4 text-neutral-900" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold font-display uppercase tracking-wider text-neutral-950">
                  Admin Access
                </h3>
                <p className="text-xs text-neutral-500">
                  Enter password to manage works
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••"
                    className="w-full border-b border-black text-center py-3 text-lg font-mono tracking-widest focus:outline-none"
                    autoFocus
                    id="admin-password-input"
                  />
                  {loginError && (
                    <p className="text-xs text-red-500 mt-2 font-medium">{loginError}</p>
                  )}
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="submit"
                    className="flex-1 bg-black hover:bg-neutral-900 text-white py-3.5 text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer"
                    id="admin-login-submit"
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 py-3.5 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Authenticated Admin Screens */
            <div className="space-y-10">
              {/* Storage Auto-Sync Utility Box */}
              <div className="border border-neutral-200 bg-neutral-50/50 p-5 rounded-none space-y-3">
                <div className="flex gap-3">
                  <Cloud className="w-5 h-5 text-neutral-800 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900 font-mono">
                      🔄 클라우드 저장소 파일 자동 연동
                    </h4>
                    <p className="text-xs text-neutral-600 leading-relaxed font-light">
                      이미 파이어베이스 스토리지(Firebase Storage)에 업로드되어 있는 파일이 있나요? 
                      별도로 직접 링크 주소를 찾아 복사-붙여넣기 할 필요 없이, 
                      아래 버튼을 클릭하면 <strong>모든 동영상, 썸네일, 포트폴리오 PDF 파일을 자동으로 탐색하여 한 번에 연동</strong>해 드립니다.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={() => handleAutoSyncStorage(false)}
                    disabled={isSyncingStorage}
                    className="inline-flex items-center gap-2 bg-neutral-900 hover:bg-black disabled:bg-neutral-400 text-white font-bold tracking-widest text-[10px] uppercase px-4 py-2.5 transition-all cursor-pointer rounded-none font-mono"
                  >
                    {isSyncingStorage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>자동 연동 중...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-3.5 h-3.5" />
                        <span>클라우드 저장소 파일 자동 연동하기</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Cloud Sync Warning Banner */}
              {hasLocalAssets && (
                <div className="border border-amber-200 bg-amber-50/50 p-5 rounded-none space-y-3">
                  <div className="flex gap-3">
                    <Cloud className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 font-mono">
                        ⚠️ 로컬 데이터 발견 (모바일 미연동 상태)
                      </h4>
                      <p className="text-xs text-amber-700 leading-relaxed font-light">
                        현재 이 브라우저(PC)에 임시 저장되어 있는 파일(PDF, 썸네일, 동영상)이 있습니다.
                        이 상태에서는 <strong>모바일 기기나 다른 브라우저에서 이미지와 영상이 표시되지 않습니다.</strong>
                        <br />
                        아래 버튼을 눌러 모든 데이터를 글로벌 클라우드(Firebase)로 전송하고 연동하세요.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleCloudMigration}
                      disabled={isMigrating}
                      className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold tracking-widest text-[10px] uppercase px-4 py-2.5 transition-all cursor-pointer rounded-none font-mono"
                    >
                      {isMigrating ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>전송 중...</span>
                        </>
                      ) : (
                        <>
                          <Cloud className="w-3.5 h-3.5" />
                          <span>클라우드로 일괄 전송 (모바일 연동)</span>
                        </>
                      )}
                    </button>
                    {isMigrating && (
                      <span className="text-[11px] text-amber-600 font-medium font-mono animate-pulse">
                        {migrationStatus}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 1. Featured Works Editor */}
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">
                    작업물 관리 ({portfolioItems.length})
                  </h3>
                  <button
                    onClick={startAddNewItem}
                    className="flex items-center gap-1.5 bg-black hover:bg-neutral-900 text-white text-xs font-bold uppercase tracking-widest px-3 py-2 rounded-none transition-colors cursor-pointer"
                    id="add-item-button"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    새 작업 추가
                  </button>
                </div>

                {/* Form to add or edit item */}
                <AnimatePresence mode="wait">
                  {(isAddingNew || editingItem) && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-neutral-50 border border-neutral-200 rounded-none p-5 space-y-4"
                    >
                      <div className="flex justify-between items-center pb-2 border-b border-neutral-200">
                        <span className="text-xs uppercase tracking-wider font-bold text-neutral-900">
                          {isAddingNew ? "새 작업물 추가" : "작업물 정보 수정"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingNew(false);
                            setEditingItem(null);
                          }}
                          className="text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                        >
                          <Undo className="w-3 h-3" /> 취소
                        </button>
                      </div>

                      <form onSubmit={handleItemSubmit} className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-neutral-600 font-medium mb-1">
                              작업 구분 (예: AI Commercial 01)*
                            </label>
                            <input
                              type="text"
                              required
                              value={itemForm.title}
                              onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                              placeholder="AI Commercial 01"
                              className="w-full px-3 py-2 border border-neutral-200 rounded-none bg-white text-neutral-800 focus:outline-none focus:border-black"
                            />
                          </div>
                          <div>
                            <label className="block text-neutral-600 font-medium mb-1">
                              제작 연도 (예: 2026)*
                            </label>
                            <input
                              type="text"
                              required
                              value={itemForm.year}
                              onChange={(e) => setItemForm({ ...itemForm, year: e.target.value })}
                              placeholder="2026"
                              className="w-full px-3 py-2 border border-neutral-200 rounded-none bg-white text-neutral-800 focus:outline-none focus:border-black"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-neutral-600 font-medium mb-1">
                              클라이언트 / 캠페인명 (예: Genesis - Art of AI)*
                          </label>
                          <input
                            type="text"
                            required
                            value={itemForm.client}
                            onChange={(e) => setItemForm({ ...itemForm, client: e.target.value })}
                            placeholder="Samsung Galaxy - AI Era"
                            className="w-full px-3 py-2 border border-neutral-200 rounded-none bg-white text-neutral-800 focus:outline-none focus:border-black"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-neutral-600 font-medium text-xs">
                              영상 재생 URL / 직접 업로드*
                            </label>
                            <button
                              type="button"
                              onClick={() => videoFileInputRef.current?.click()}
                              className="text-[10px] font-bold text-neutral-900 border border-neutral-200 bg-white hover:bg-neutral-50 px-2 py-0.5 flex items-center gap-1 cursor-pointer"
                            >
                              <Upload className="w-3 h-3" />
                              {itemForm.videoUrl?.startsWith("indexeddb:") ? "동영상 변경" : "동영상 파일 업로드"}
                            </button>
                            <input
                              ref={videoFileInputRef}
                              type="file"
                              accept="video/*"
                              onChange={handleVideoUpload}
                              className="hidden"
                            />
                          </div>

                          {itemForm.videoUrl?.startsWith("indexeddb:") ? (
                            <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200">
                              <span className="text-xs text-neutral-800 font-medium truncate max-w-[250px]">
                                📁 업로드된 로컬 비디오 재생 활성화됨
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setItemForm((prev) => ({ ...prev, videoUrl: "" }));
                                  setVideoUploadProgress(null);
                                }}
                                className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                              >
                                비우고 주소 입력하기
                              </button>
                            </div>
                          ) : (
                            <input
                              type="text"
                              required
                              value={itemForm.videoUrl}
                              onChange={(e) => setItemForm({ ...itemForm, videoUrl: e.target.value })}
                              placeholder="https://assets.mixkit.co/...mp4 또는 유튜브/비메오 주소"
                              className="w-full px-3 py-2 border border-neutral-200 rounded-none bg-white text-neutral-800 focus:outline-none focus:border-black font-mono"
                            />
                          )}
                          {videoUploadProgress === "업로드 중..." && (
                            <p className="text-[10px] text-blue-600 mt-1 font-medium animate-pulse">동영상 파일을 인코딩 및 데이터베이스에 저장 중입니다...</p>
                          )}
                          <p className="text-[10px] text-neutral-500 mt-1">
                            * 직접 비디오 파일을 업로드하거나, 외부 MP4/유튜브/비메오 주소를 자유롭게 입력해 활용할 수 있습니다.
                          </p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-neutral-600 font-medium text-xs">
                              썸네일 이미지 URL / 직접 업로드*
                            </label>
                            <button
                              type="button"
                              onClick={() => thumbFileInputRef.current?.click()}
                              className="text-[10px] font-bold text-neutral-900 border border-neutral-200 bg-white hover:bg-neutral-50 px-2 py-0.5 flex items-center gap-1 cursor-pointer"
                            >
                              <Upload className="w-3 h-3" />
                              {itemForm.thumbnailUrl?.startsWith("indexeddb:") ? "썸네일 변경" : "썸네일 이미지 업로드"}
                            </button>
                            <input
                              ref={thumbFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleThumbUpload}
                              className="hidden"
                            />
                          </div>

                          {itemForm.thumbnailUrl?.startsWith("indexeddb:") ? (
                            <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200">
                              <span className="text-xs text-neutral-800 font-medium truncate max-w-[250px]">
                                🖼️ 업로드된 로컬 이미지 사용 중
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setItemForm((prev) => ({ ...prev, thumbnailUrl: "" }));
                                  setThumbUploadProgress(null);
                                }}
                                className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                              >
                                비우고 주소 입력하기
                              </button>
                            </div>
                          ) : (
                            <input
                              type="text"
                              required
                              value={itemForm.thumbnailUrl}
                              onChange={(e) => setItemForm({ ...itemForm, thumbnailUrl: e.target.value })}
                              placeholder="https://images.unsplash.com/photo-..."
                              className="w-full px-3 py-2 border border-neutral-200 rounded-none bg-white text-neutral-800 focus:outline-none focus:border-black font-mono"
                            />
                          )}
                          {thumbUploadProgress === "업로드 중..." && (
                            <p className="text-[10px] text-blue-600 mt-1 font-medium animate-pulse">이미지 파일을 데이터베이스에 로드하는 중입니다...</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-neutral-600 font-medium mb-1">
                            작업 설명 (상세 코멘트)
                          </label>
                          <textarea
                            rows={3}
                            value={itemForm.description}
                            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                            placeholder="제작 방식 및 생성형 툴 활용, 캠페인 성과 등에 대해 간략하게 기술해 주세요."
                            className="w-full px-3 py-2 border border-neutral-200 rounded-none bg-white text-neutral-800 focus:outline-none focus:border-black"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full bg-black hover:bg-neutral-900 text-white py-3.5 rounded-none font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer"
                        >
                          {isAddingNew ? "추가하기" : "수정 완료"}
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Items Grid/List */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {[...portfolioItems]
                    .sort((a, b) => a.order - b.order)
                    .map((item, index) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 border border-neutral-100 rounded-none hover:border-neutral-200 hover:bg-neutral-50 transition-all text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ResolvedImage
                            src={item.thumbnailUrl}
                            alt=""
                            className="w-10 h-10 object-cover rounded-none bg-neutral-100 shrink-0 border border-neutral-200"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-neutral-900 truncate">
                              {item.title}
                            </p>
                            <p className="text-neutral-500 truncate max-w-[280px]">
                              {item.client} ({item.year})
                            </p>

                            {/* Direct Cloud Upload Shortcut Buttons */}
                            <div className="flex gap-2 mt-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveUploadItemId(item.id);
                                  setTimeout(() => thumbFileInputRef.current?.click(), 50);
                                }}
                                className="text-[9px] font-bold text-neutral-600 hover:text-black border border-neutral-200 bg-white hover:bg-neutral-50 px-2 py-0.5 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                {uploadProgressMap[`thumb-${item.id}`] === "업로드 중..." ? (
                                  <>
                                    <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-600" />
                                    <span>업로드 중...</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-2.5 h-2.5 text-neutral-400" />
                                    <span>썸네일 직접 업로드</span>
                                  </>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setActiveUploadItemId(item.id);
                                  setTimeout(() => videoFileInputRef.current?.click(), 50);
                                }}
                                className="text-[9px] font-bold text-neutral-600 hover:text-black border border-neutral-200 bg-white hover:bg-neutral-50 px-2 py-0.5 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                {uploadProgressMap[`video-${item.id}`] === "업로드 중..." ? (
                                  <>
                                    <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-600" />
                                    <span>업로드 중...</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-2.5 h-2.5 text-neutral-400" />
                                    <span>동영상 직접 업로드</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Order actions */}
                          <button
                            onClick={() => moveItem(index, "up")}
                            disabled={index === 0}
                            className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 disabled:hover:text-neutral-400 rounded hover:bg-neutral-100 transition-colors"
                            title="위로 이동"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveItem(index, "down")}
                            disabled={index === portfolioItems.length - 1}
                            className="p-1.5 text-neutral-400 hover:text-neutral-900 disabled:opacity-30 disabled:hover:text-neutral-400 rounded hover:bg-neutral-100 transition-colors"
                            title="아래로 이동"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Action tools */}
                          <button
                            onClick={() => startEditItem(item)}
                            className="p-1.5 text-neutral-500 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
                            title="정보 수정"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-neutral-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                            title="작업 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </section>

              {/* 2. Portfolio PDF Link Settings */}
              <section className="space-y-4 border-t border-neutral-100 pt-6">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-neutral-950" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-900">
                    포트폴리오 다운로드 (PDF) 설정
                  </h3>
                </div>

                <div className="space-y-4 text-xs">
                  {/* File Upload / Drag-and-drop Area */}
                  <div>
                    <label className="block text-neutral-600 font-medium mb-1.5">
                      포트폴리오 PDF 파일 업로드 / 관리
                    </label>

                    {uploadedFileName ? (
                      /* File uploaded card */
                      <div className="flex items-center justify-between p-4 border border-neutral-200 bg-neutral-50">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-neutral-100 border border-neutral-200">
                            <FileText className="w-4 h-4 text-neutral-800" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-neutral-900 truncate">
                              {uploadedFileName}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-mono">
                              업로드 완료 (인터넷 연결 없이도 상시 다운로드 가능)
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 text-[10px] font-bold border border-neutral-200 hover:bg-neutral-100 uppercase transition-colors"
                          >
                            교체
                          </button>
                          <button
                            type="button"
                            onClick={handleFileDelete}
                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 border border-neutral-100 hover:border-red-200 transition-all"
                            title="파일 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Drag & drop zone */
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                          isDragging
                            ? "border-black bg-neutral-50 scale-[0.99]"
                            : "border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50/50"
                        }`}
                      >
                        <Upload className="w-6 h-6 mx-auto mb-2 text-neutral-400" />
                        <p className="font-bold text-neutral-800">
                          포트폴리오 PDF 파일을 여기에 드래그하거나 클릭하여 업로드하세요.
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-1">
                          PDF 형식만 지원 / 파일 크기 제한 없음 (브라우저 로컬 안전 보관)
                        </p>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  <form onSubmit={handleSaveSettings} className="space-y-3">
                    {/* Fallback external link */}
                    {!uploadedFileName && (
                      <div>
                        <label className="block text-neutral-600 font-medium mb-1">
                          또는 외부 PDF 링크 URL 연동
                        </label>
                        <input
                          type="text"
                          value={settingsForm.pdfUrl === "local_indexeddb" ? "" : settingsForm.pdfUrl}
                          onChange={(e) => setSettingsForm({ ...settingsForm, pdfUrl: e.target.value })}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black font-mono"
                          placeholder="https://example.com/portfolio.pdf"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-600 font-medium mb-1">
                          다운로드될 파일명
                        </label>
                        <input
                          type="text"
                          value={settingsForm.pdfFileName}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, pdfFileName: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black"
                          placeholder="CHA_CD_Portfolio_2026.pdf"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-600 font-medium mb-1">
                          상단 소개글
                        </label>
                        <input
                          type="text"
                          value={settingsForm.introduction || ""}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, introduction: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black"
                          placeholder="20년 실무 경험을 바탕으로..."
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="flex items-center justify-center gap-1.5 w-full bg-black hover:bg-neutral-900 text-white py-3.5 rounded-none font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      포트폴리오 설정 저장
                    </button>
                  </form>
                </div>
              </section>

              {/* 3. Contact Information Editor */}
              <section className="space-y-4 border-t border-neutral-100 pt-6">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-neutral-950" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-900">
                    연락처 정보 관리
                  </h3>
                </div>

                <form onSubmit={handleSaveContact} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-neutral-600 font-medium mb-1">
                        이메일 주소
                      </label>
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-600 font-medium mb-1">
                        전화번호
                      </label>
                      <input
                        type="text"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-neutral-600 font-medium mb-1">
                        인스타그램 ID
                      </label>
                      <input
                        type="text"
                        value={contactForm.instagram || ""}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, instagram: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black font-mono"
                        placeholder="cha_cd_creative"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-600 font-medium mb-1">
                        링크드인 URL
                      </label>
                      <input
                        type="text"
                        value={contactForm.linkedin || ""}
                        onChange={(e) =>
                          setContactForm({ ...contactForm, linkedin: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black font-mono"
                        placeholder="linkedin.com/in/cha-cd-creative"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-neutral-600 font-medium mb-1">
                      사무실 / 스튜디오 주소
                    </label>
                    <input
                      type="text"
                      value={contactForm.officeAddress || ""}
                      onChange={(e) =>
                        setContactForm({ ...contactForm, officeAddress: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-none focus:outline-none focus:border-black"
                    />
                  </div>

                  <button
                    type="submit"
                    className="flex items-center justify-center gap-1.5 w-full bg-black hover:bg-neutral-900 text-white py-3.5 rounded-none font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    연락처 정보 저장
                  </button>
                </form>
              </section>

              {/* Reset state helper */}
              <div className="border-t border-neutral-100 pt-4 flex justify-between items-center text-[11px] text-neutral-400">
                <span>데이터 초기화가 필요한가요?</span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("모든 설정과 추가한 작업물을 기본 데이터 상태로 리셋하시겠습니까?")) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="text-neutral-500 hover:text-red-600 font-medium transition-colors"
                >
                  기본값 복원 (초기화)
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
