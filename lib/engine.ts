import type { Report, CaseId } from './types';
export type RunInput = {
  case: CaseId;
  noise: number;
  max_calls: number;
  repeats: number;
  trace_json?: string;
};
export class Engine {
  private worker: Worker | null = null;
  private reject: ((reason: Error) => void) | null = null;
  private sequence = 0;
  run(request: RunInput): Promise<Report> {
    if (this.reject)
      return Promise.reject(new Error('A reduction is already running.'));
    this.worker ??= new Worker('/casecrop-worker.mjs', { type: 'module' });
    const worker = this.worker;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.cancel('Python took too long. Please retry.'),
        90_000,
      );
      const cleanup = () => {
        clearTimeout(timer);
        this.reject = null;
        worker.onmessage = null;
        worker.onerror = null;
      };
      this.reject = (error) => {
        cleanup();
        reject(error);
      };
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return;
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.result as Report);
      };
      worker.onerror = () =>
        this.cancel('Python could not start. Check your connection and retry.');
      worker.postMessage({ id, request });
    });
  }
  cancel(message = 'Run cancelled. Your previous result is still available.') {
    this.worker?.terminate();
    this.worker = null;
    this.reject?.(new Error(message));
  }
}
