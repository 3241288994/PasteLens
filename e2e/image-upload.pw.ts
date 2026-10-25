import { expect, test, type Page } from "@playwright/test";
import { emptyUploadSnapshot, type UploadPhase } from "../src/image-upload-model";

async function mockDesktop(page: Page): Promise<void> {
  await page.addInitScript((initial) => {
    const state=window as any;state.isTauri=true;const callbacks=new Map<number,Function>();const events=new Map<string,number>();let next=1;
    state.uploadTest={snapshot:initial,calls:[],emit:(phase:string,extra={})=>{
      Object.assign(initial.status,{phase,id:123,revision:initial.status.revision+1,host:"GPU-Server-Codex",directory:"/home/ldy/project/attachments"},extra);
      callbacks.get(events.get("image-upload-state")!)?.({event:"image-upload-state",payload:JSON.parse(JSON.stringify(initial))});
    }};
    state.__TAURI_INTERNALS__={
      transformCallback:(fn:Function)=>{const id=next++;callbacks.set(id,fn);return id;},unregisterCallback:(id:number)=>callbacks.delete(id),
      metadata:{currentWindow:{label:"viewer"},currentWebview:{label:"viewer"}},
      invoke:async(command:string,args:any={})=>{
        state.uploadTest.calls.push({command,args});
        if(command==="plugin:event|listen"){events.set(args.event,args.handler);return next++;}
        if(command==="get_image_upload_snapshot")return JSON.parse(JSON.stringify(initial));
        if(command==="configure_image_upload"){initial.settings=args.settings;initial.status.revision++;return JSON.parse(JSON.stringify(initial));}
        if(command==="check_image_upload_target")return args.directory;
        if(command==="start_image_upload")state.uploadTest.emit("reading");
        if(command==="cancel_image_upload")state.uploadTest.emit("cancelled");
        if(command==="copy_image_upload_path")state.uploadTest.emit("success");
        if(command==="load_history_workspace"||command==="load_drafts")return null;
        return null;
      },
    };
  }, emptyUploadSnapshot());
}

test("replaces file browsing with a visible, configurable quick-send control", async ({page}) => {
  await mockDesktop(page);await page.goto("/");
  await expect(page.locator("#file-workspace")).toHaveCount(0);
  await page.locator("#open-image-upload").click();
  await expect(page.getByRole("heading",{name:"图片快传",exact:true})).toBeVisible();
  await page.evaluate(()=>(window as any).uploadTest.emit("setup"));
  await expect(page.locator("#upload-panel-status")).toBeHidden();
  await expect(page.locator("#upload-now")).toBeDisabled();
  await page.locator("#upload-host").fill("GPU-Server-Codex");
  await page.locator("#upload-directory").fill("/home/ldy/project/attachments");
  await page.locator("#upload-save").click();
  await expect(page.locator("#upload-now")).toBeEnabled();
  await page.locator("#upload-shortcut-record").click();
  await page.keyboard.press("Control+Alt+KeyP");
  await expect(page.locator("#upload-shortcut-record")).toContainText("P");
  await expect(page.locator("#upload-now")).toBeDisabled();
  await page.locator("#upload-save").click();
  await page.locator("#upload-now").click();
  await expect(page.locator("#upload-panel-status")).toContainText("正在读取");
  await expect(page.locator("#upload-save")).toBeDisabled();
  const calls=await page.evaluate(()=>(window as any).uploadTest.calls);
  expect(calls.filter((x:any)=>x.command==="start_image_upload")).toHaveLength(1);
  expect(calls.find((x:any)=>x.command==="set_image_upload_recording"&&x.args.recording)).toBeTruthy();
});

test("keeps old preferences but requires confirmation", async ({page}) => {
  await page.addInitScript(()=>{
    localStorage.setItem("pastelens.workspace-mode.v1","files");
    localStorage.setItem("pastelens.file-workspace.v1",JSON.stringify({remoteHost:"old-gpu",uploadDirectory:"~/screens",remotePath:"/unrelated"}));
  });
  await mockDesktop(page);await page.goto("/");await page.locator("#open-image-upload").click();
  await expect(page.locator("#upload-host")).toHaveValue("old-gpu");
  await expect(page.locator("#upload-directory")).toHaveValue("~/screens");
  await expect(page.locator("#upload-now")).toBeDisabled();
  await expect(page.locator("#app-shell")).toHaveAttribute("data-workspace-mode","reader");
});

test("renders light/dark HUD states without overflow or unsafe HTML", async ({page}) => {
  await mockDesktop(page);await page.setViewportSize({width:430,height:280});await page.goto("/upload.html");
  for(const scheme of ["light","dark"] as const){
    await page.emulateMedia({colorScheme:scheme});
    for(const phase of ["setup","reading","uploading","verifying","success","uploaded","error","cancelled"] as UploadPhase[]){
      await page.evaluate(({phase})=>(window as any).uploadTest.emit(phase,{
        path:["success","uploaded"].includes(phase)?"/home/ldy/project/attachments/shot-20261025.png":"",
        detail:phase==="error"?"连接超时，请确认 VPN 与 SSH 服务可用。<script>throw 1</script>":phase==="uploaded"?"剪贴板中有新内容，未覆盖。请手动复制路径。":"",
        retryable:phase==="error",width:1920,height:1080,size:1340000,
      }),{phase});
      await expect(page.locator(".upload-status-card")).toHaveAttribute("data-phase",phase);
      const bounds=await page.locator(".upload-status-card").boundingBox();
      expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(280);
      expect(await page.locator("script:not([src])").count()).toBe(0);
      await page.screenshot({path:`/tmp/pastelens-ui-tests/hud-${scheme}-${phase}.png`});
    }
  }
});

test("the settings sheet fits the minimum window and remains keyboard accessible", async ({page}) => {
  await mockDesktop(page);await page.setViewportSize({width:620,height:480});await page.goto("/");
  await page.locator("#open-image-upload").click();
  await expect(page.locator("#upload-panel-close")).toBeVisible();
  await page.locator("#upload-save").scrollIntoViewIfNeeded();
  await expect(page.locator("#upload-save")).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.locator("#image-upload-panel")).not.toBeVisible();
});

test("the floating ball stays purple in every upload state", async ({page}) => {
  await mockDesktop(page);await page.setViewportSize({width:52,height:52});await page.goto("/ball.html");
  const ball=page.locator("#floating-ball");
  const purple=await ball.evaluate(element=>getComputedStyle(element).backgroundImage);
  expect(purple).toContain("119, 116, 236");
  for(const phase of ["reading","uploading","success","uploaded","error","cancelled"]){
    await page.evaluate(phase=>(window as any).uploadTest.emit(phase),phase);
    await expect(ball).toHaveAttribute("data-upload-phase",phase);
    expect(await ball.evaluate(element=>getComputedStyle(element).backgroundImage)).toBe(purple);
  }
});

test("offers the absolute image path rather than a generated prompt", async ({page}) => {
  await mockDesktop(page);await page.goto("/upload.html");
  await page.evaluate(()=>(window as any).uploadTest.emit("uploaded",{path:"/home/ldy/attachments/shot.png"}));
  await page.getByRole("button",{name:"复制路径",exact:true}).click();
  await expect(page.locator(".upload-status-card")).toContainText("上传成功，路径已复制");
  expect(await page.evaluate(()=>(window as any).uploadTest.calls.some((call:any)=>call.command==="copy_image_upload_path"&&call.args.id===123))).toBe(true);
  await expect(page.locator(".upload-status-card")).not.toContainText("view_image");
});

test("captures the quick-send settings design", async ({page}) => {
  await mockDesktop(page);await page.goto("/");await page.locator("#open-image-upload").click();
  for(const scheme of ["light","dark"] as const){
    await page.emulateMedia({colorScheme:scheme});
    await page.screenshot({path:`/tmp/pastelens-ui-tests/settings-${scheme}.png`});
  }
});
