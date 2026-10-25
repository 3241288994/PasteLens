import { describe, expect, it, vi } from "vitest";
import { DEFAULT_UPLOAD_SETTINGS, describeUploadError, emptyUploadSnapshot, isUploadBusy, legacyUploadSettings, shortcutFromEvent, shortcutKeys, uploadMessage } from "../src/image-upload-model";
import { escapeHtml, statusMarkup } from "../src/image-upload-view";

describe("image quick send", () => {
  it("requires first-use confirmation and retains the selected SSH alias", () => {
    expect(DEFAULT_UPLOAD_SETTINGS.configured).toBe(false);
    expect(DEFAULT_UPLOAD_SETTINGS.host).toBe("GPU-Server-Codex");
    expect(DEFAULT_UPLOAD_SETTINGS.shortcut).toBe("Control+Alt+V");
  });
  it("migrates only connection preferences, not the last browsed directory", () => {
    expect(legacyUploadSettings(JSON.stringify({remoteHost:"gpu",uploadDirectory:"~/pics",remotePath:"/other-project"}))).toEqual({host:"gpu",directory:"~/pics"});
    expect(legacyUploadSettings("invalid")).toBeNull();
  });
  it.each(["reading", "connecting", "uploading", "verifying", "cancelling"] as const)("reports %s as busy", (phase) => expect(isUploadBusy(phase)).toBe(true));
  it.each(["idle", "setup", "error", "cancelled", "success", "uploaded"] as const)("reports %s as terminal", (phase) => expect(isUploadBusy(phase)).toBe(false));
  it("uses native-looking Mac keycaps without hiding the Windows equivalent", () => {
    expect(shortcutKeys("Control+Alt+V",true)).toEqual(["⌃","⌥","V"]);
    expect(shortcutKeys("Control+Alt+V",false)).toEqual(["Ctrl","Alt","V"]);
  });
  it("records physical keys so Option-modified letters still work", () => {
    expect(shortcutFromEvent({ctrlKey:true,altKey:true,shiftKey:false,metaKey:false,code:"KeyV"})).toBe("Control+Alt+V");
    expect(shortcutFromEvent({ctrlKey:false,altKey:false,shiftKey:false,metaKey:true,code:"KeyV"})).toBeNull();
    expect(shortcutFromEvent({ctrlKey:false,altKey:true,shiftKey:true,metaKey:false,code:"Space"})).toBeNull();
  });
  it("does not claim a copied path or AI receipt when only uploaded", () => {
    const state=emptyUploadSnapshot().status;state.phase="uploaded";
    const message=uploadMessage(state);
    expect(message.title).toContain("等待复制");
    expect(message.title).not.toContain("已复制");
    expect(message.description).not.toContain("AI 已读取");
  });
  it("uses the absolute path as the only copyable upload result", () => {
    vi.stubGlobal("navigator", {platform:"MacIntel"});
    const snapshot=emptyUploadSnapshot();
    snapshot.status.phase="success";
    snapshot.status.host="GPU-Server-Codex";
    snapshot.status.path="/home/ldy/attachments/shot.png";
    const html=statusMarkup(snapshot,true);
    expect(html).toContain("上传成功，路径已复制");
    expect(html).toContain('data-upload-action="copy">复制路径');
    expect(html).toContain(snapshot.status.path);
    expect(snapshot.status).not.toHaveProperty("reference");
    vi.unstubAllGlobals();
  });
  it("explains authentication errors without recommending insecure SSH flags", () => {
    expect(describeUploadError("Permission denied (publickey)")).toContain("密钥");
    expect(describeUploadError("Host key verification failed")).toContain("核对服务器身份");
  });
  it("escapes server-generated errors and paths in both visible text and attributes", () => {
    vi.stubGlobal("navigator", {platform:"MacIntel"});
    const snapshot=emptyUploadSnapshot();snapshot.status.phase="error";
    snapshot.status.detail='<img src=x onerror="alert(1)">';snapshot.status.host="gpu";snapshot.status.directory='"<script>';
    const html=statusMarkup(snapshot,true);
    expect(html).not.toContain("<script>");expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(escapeHtml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
    vi.unstubAllGlobals();
  });
  it("shows real stages without a fabricated percentage", () => {
    vi.stubGlobal("navigator", {platform:"MacIntel"});
    const snapshot=emptyUploadSnapshot();snapshot.status.phase="uploading";
    const html=statusMarkup(snapshot,true);
    expect(html).toContain("图片正在上传");expect(html).toContain("校验");
    expect(html).not.toMatch(/\d+%/);expect(html).toContain('data-upload-action="cancel"');
    vi.unstubAllGlobals();
  });
});
