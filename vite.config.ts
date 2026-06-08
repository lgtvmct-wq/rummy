import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import https from 'https';
import {defineConfig, loadEnv} from 'vite';

const downloadAnthem = () => {
  const localDest = path.resolve(__dirname, 'elite_circle_anthem.mp3');
  const tempDest = path.resolve(__dirname, 'elite_circle_anthem.mp3.tmp');
  const fileUrl = 'https://raw.githubusercontent.com/lgtvmct-wq/rummy/main/elite_circle_anthem.mp3';
  
  const createFallback = () => {
    try {
      if (!fs.existsSync(localDest) || fs.statSync(localDest).size <= 1000) {
        fs.writeFileSync(localDest, Buffer.alloc(2048));
        console.log('[Anthem] Created local fallback placeholder of 2048 bytes.');
      }
    } catch (err) {
      console.error('[Anthem] Critical error creating fallback:', err);
    }
  };

  if (fs.existsSync(localDest) && fs.statSync(localDest).size > 1000) {
    console.log('[Anthem] Local anthem is already present and valid.');
    return;
  }
  
  console.log('[Anthem] Local file missing or invalid. Downloading from GitHub...');
  try {
    const file = fs.createWriteStream(tempDest);
    const req = https.get(fileUrl, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          try {
            if (fs.existsSync(tempDest) && fs.statSync(tempDest).size > 1000) {
              fs.renameSync(tempDest, localDest);
              console.log('[Anthem] Download success: Saved to ' + localDest);
              // Auto copy to dist folder if it exists
              const distDir = path.resolve(__dirname, 'dist');
              if (fs.existsSync(distDir)) {
                fs.copyFileSync(localDest, path.resolve(distDir, 'elite_circle_anthem.mp3'));
              }
            } else {
              console.error('[Anthem] Download finished but temp file size is invalid.');
              fs.unlink(tempDest, () => {});
              createFallback();
            }
          } catch (err) {
            console.error('[Anthem] Error during temp file rename/validation:', err);
            fs.unlink(tempDest, () => {});
            createFallback();
          }
        });
      } else {
        console.error('[Anthem] Failed to download, status: ' + response.statusCode);
        file.close();
        fs.unlink(tempDest, () => {});
        createFallback();
      }
    });

    req.on('error', (err) => {
      console.error('[Anthem] Connection error during download:', err.message);
      file.close();
      fs.unlink(tempDest, () => {});
      createFallback();
    });

    req.setTimeout(3500, () => {
      console.warn('[Anthem] Download timed out after 3500ms.');
      req.destroy();
    });
  } catch (error) {
    console.error('[Anthem] Unexpected error triggering download:', error);
    createFallback();
  }
};

// Trigger immediately on load
downloadAnthem();

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'copy-anthem-mp3',
        closeBundle() {
          try {
            const possiblePaths = [
              path.resolve(__dirname, 'elite_circle_anthem.mp3'),
              path.resolve(__dirname, 'src/elite_circle_anthem.mp3'),
            ];
            const distDir = path.resolve(__dirname, 'dist');
            const destPath = path.resolve(distDir, 'elite_circle_anthem.mp3');
            if (!fs.existsSync(distDir)) {
              fs.mkdirSync(distDir, { recursive: true });
            }
            for (const srcPath of possiblePaths) {
              if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                console.log(`[Success] Copied custom anthem to production: ${srcPath} -> ${destPath}`);
                break;
              }
            }
          } catch (e) {
            console.error('Error auto-copying elite_circle_anthem.mp3:', e);
          }
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
