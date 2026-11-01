import { fork } from 'node:child_process';

export function recognizeInvoiceInProcess(filePath) {
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./invoiceOcrWorker.js', import.meta.url), [], {
      execArgv: ['--max-old-space-size=128'],
      env: { ...process.env, OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    let result;
    let failure;
    const timer = setTimeout(() => {
      failure = new Error('Invoice recognition exceeded its time limit. Try a smaller, clearer image.');
      child.kill('SIGKILL');
    }, 55_000);
    child.once('message', message => {
      if (typeof message?.text === 'string' && message.text.length <= 1_000_000) result = message.text;
      else failure = new Error('Invoice recognition could not finish.');
    });
    child.once('error', error => { failure = error; });
    // Wait for exit before releasing the concurrency slot or removing its image.
    child.once('close', code => {
      clearTimeout(timer);
      if (!failure && code === 0 && result !== undefined) resolve(result);
      else reject(failure || new Error('Invoice recognition stopped before completing.'));
    });
    child.send({ filePath }, error => { if (error) { failure = error; child.kill('SIGKILL'); } });
  });
}
