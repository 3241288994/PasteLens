import { describe, expect, it, vi } from "vitest";
import { createDeferredQuitController } from "../src/context-menu-quit";

describe("context menu quit controller", () => {
  it("waits for the native menu to close before quitting", async () => {
    const quit = vi.fn(async () => undefined);
    const controller = createDeferredQuitController(quit);

    controller.beginMenu();
    await controller.requestQuit();
    expect(quit).not.toHaveBeenCalled();

    await controller.endMenu();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("quits immediately when no native menu is open", async () => {
    const quit = vi.fn(async () => undefined);
    const controller = createDeferredQuitController(quit);

    await controller.requestQuit();
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated quit requests", async () => {
    const quit = vi.fn(async () => undefined);
    const controller = createDeferredQuitController(quit);

    controller.beginMenu();
    await controller.requestQuit();
    await controller.requestQuit();
    await controller.endMenu();

    expect(quit).toHaveBeenCalledTimes(1);
  });
});
