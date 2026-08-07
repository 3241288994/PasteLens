export interface DeferredQuitController {
  beginMenu(): void;
  requestQuit(): Promise<void>;
  endMenu(): Promise<void>;
}

export function createDeferredQuitController(
  quit: () => Promise<void>,
): DeferredQuitController {
  let menuOpen = false;
  let quitPending = false;
  let quitting = false;

  async function flushQuit(): Promise<void> {
    if (menuOpen || !quitPending || quitting) {
      return;
    }
    quitPending = false;
    quitting = true;
    try {
      await quit();
    } finally {
      quitting = false;
    }
  }

  return {
    beginMenu() {
      menuOpen = true;
    },
    requestQuit() {
      quitPending = true;
      return flushQuit();
    },
    endMenu() {
      menuOpen = false;
      return flushQuit();
    },
  };
}
