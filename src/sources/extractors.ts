/**
 * Text extraction from various file formats.
 */
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { getClient, EXTRACT_MODEL } from '@/ai/client';

// Configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const MAX_TEXT_LENGTH = 500000; // 500KB of text

async function checkFileExists(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  try {
    const file = new File(filePath);
    if (typeof file.exists === 'boolean') {
      return file.exists;
    }
  } catch {
    // fallback
  }
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return !!info.exists;
  } catch {
    // Android content:// URIs can fail getInfoAsync but are still readable
    if (filePath.startsWith('content://')) {
      return true;
    }
    return false;
  }
}

async function readFileAsText(filePath: string, fallbackUri?: string): Promise<string> {
  try {
    const file = new File(filePath);
    if (typeof file.text === 'function') {
      const txt = await file.text();
      if (txt) return txt;
    }
  } catch {
    // fallback
  }
  try {
    return await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    if (fallbackUri && fallbackUri !== filePath) {
      return await FileSystem.readAsStringAsync(fallbackUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }
    throw err;
  }
}

async function readFileAsBase64(filePath: string, fallbackUri?: string): Promise<string> {
  try {
    const file = new File(filePath);
    if (typeof file.base64 === 'function') {
      const b64 = await file.base64();
      if (b64) return b64;
    }
  } catch {
    // fallback
  }
  try {
    return await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (err) {
    if (fallbackUri && fallbackUri !== filePath) {
      return await FileSystem.readAsStringAsync(fallbackUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    throw err;
  }
}

export async function extractText(filePath: string, fileType: string, fallbackUri?: string): Promise<string> {
  let target = filePath;
  let exists = await checkFileExists(target);

  if (!exists && fallbackUri) {
    if (await checkFileExists(fallbackUri)) {
      target = fallbackUri;
      exists = true;
    }
  }

  if (!exists) {
    // Retry once after 200ms in case disk sync was slightly delayed
    await new Promise((r) => setTimeout(r, 200));
    exists = await checkFileExists(target);
    if (!exists && fallbackUri) {
      if (await checkFileExists(fallbackUri)) {
        target = fallbackUri;
        exists = true;
      }
    }
  }

  // On Android, content:// URIs can be read even if getInfoAsync/exists returns false
  if (!exists && (target.startsWith('content://') || (fallbackUri && fallbackUri.startsWith('content://')))) {
    exists = true;
    if (!target.startsWith('content://') && fallbackUri?.startsWith('content://')) {
      target = fallbackUri;
    }
  }

  if (!exists) {
    throw new Error('File not found');
  }

  switch (fileType) {
    case 'txt':
      return await extractTextFile(target, fallbackUri);

    case 'pdf':
      return await extractWithRetry(() => extractPdfWithGemini(target, fallbackUri));

    case 'docx':
      return await extractWithRetry(() => extractDocxWithGemini(target, fallbackUri));

    case 'image':
      return await extractWithRetry(() => extractImageWithGemini(target, fallbackUri));

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

async function extractWithRetry(fn: () => Promise<string>): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      }

      const result = await fn();

      if (!result || result.trim().length === 0) {
        throw new Error('No text extracted');
      }

      if (result.length > MAX_TEXT_LENGTH) {
        return result.slice(0, MAX_TEXT_LENGTH) + '\n\n[Text truncated - file too large]';
      }

      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Text extraction failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

async function extractTextFile(filePath: string, fallbackUri?: string): Promise<string> {
  return await readFileAsText(filePath, fallbackUri);
}

async function extractPdfWithGemini(filePath: string, fallbackUri?: string): Promise<string> {
  const base64 = await readFileAsBase64(filePath, fallbackUri);

  const prompt = `Extract all text and tabular data from this PDF document.
CRITICAL TABLE FORMATTING RULES:
1. If the document contains any tables, schedules, or timetables (such as ship voyage schedules), you MUST format each table as a clean, complete GitHub-Flavored Markdown table with pipe (|) separators.
2. For ship or voyage schedules, ensure each vessel (e.g. MV A/SEA, MV L/SEA, MV LAGOONS, MV CORALS) has its own dedicated column header, and place each cell under its exact matching column.
3. Preserve all dates, times, island port codes (AND, KLP, KVT, AGT, AMN, KDM, KLT, CHT, BTR, MCY), and notes exactly as written.
4. Do not omit any rows or columns.
5. Return only the extracted markdown content without conversational commentary.`;

  try {
    const client = getClient();
    const response = await client.models.generateContent({
      model: EXTRACT_MODEL,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64,
          },
        },
      ],
    });

    return response.text || '';
  } catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractDocxWithGemini(filePath: string, fallbackUri?: string): Promise<string> {
  const base64 = await readFileAsBase64(filePath, fallbackUri);

  const prompt = `Extract all text from this Word document.
Return only the extracted text content, preserving structure where possible.
Do not add any commentary or explanations.`;

  try {
    const client = getClient();
    const response = await client.models.generateContent({
      model: EXTRACT_MODEL,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            data: base64,
          },
        },
      ],
    });

    return response.text || '';
  } catch (err) {
    throw new Error(`DOCX extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractImageWithGemini(filePath: string, fallbackUri?: string): Promise<string> {
  const base64 = await readFileAsBase64(filePath, fallbackUri);

  const prompt = `Extract all visible text from this image using OCR.
Return only the extracted text, maintaining the reading order.
If there's no text, return "No text found in image".
Do not add any commentary or explanations.`;

  try {
    const ext = (filePath || fallbackUri || '').toLowerCase().split('.').pop();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';

    const client = getClient();
    const response = await client.models.generateContent({
      model: EXTRACT_MODEL,
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64,
          },
        },
      ],
    });

    return response.text || '';
  } catch (err) {
    throw new Error(`Image OCR failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
