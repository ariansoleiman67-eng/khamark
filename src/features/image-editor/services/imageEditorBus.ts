type EditOptions = {
  initialMode?: 'draw' | 'text' | 'crop';
};

type EditRequest = {
  uri: string;
  options?: EditOptions;
  resolve: (resultUri: string | null) => void;
};

class ImageEditorBus {
  private listener: ((request: EditRequest) => void) | null = null;

  subscribe(listener: (request: EditRequest) => void) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  /**
   * Open the editor globally and await the result.
   * Returns the edited image URI, or null if cancelled.
   */
  openImageEditor(uri: string, options?: EditOptions): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.listener) {
        console.warn('ImageEditorBus: No listener attached! Is ImageEditorModal mounted?');
        resolve(uri); // Fallback to original
        return;
      }

      this.listener({ uri, options, resolve });
    });
  }
}

// Single static instance shared across the app
export const imageEditorBus = new ImageEditorBus();
