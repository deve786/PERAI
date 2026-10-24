/**
 * Text extraction from various file formats.
 */
import * as FileSystem from 'expo-file-system';
import { requestJson } from '@/ai/client';

// Configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const MAX_TEXT_LENGTH = 500000; // 500KB of text

export async function extractText(filePath: string, fileType: string): Promise<string> {
  // Validate file exists
  const fileInfo = await FileSystem.getInfoAsync(filePath);
  if (!fileInfo.exists) {
    throw new Error('File not found');
  }

  switch (fileType) {
    case 'txt':
      return await extractTextFile(filePath);

    case 'pdf':
      return await extractWithRetry(() => extractPdfWithGemini(filePath));

    case 'docx':
      return await extractWithRetry(() => extractDocxWithGemini(filePath));

    case 'image':
      return await extractWithRetry(() => extractImageWithGemini(filePath));

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

async function extractTextFile(filePath: string): Promise<string> {
  return await FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function extractPdfWithGemini(filePath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const prompt = `Extract all text from this PDF document.
Return only the extracted text content, preserving structure where possible.
Do not add any commentary or explanations.`;

  try {
    const response = await requestJson({
      model: 'gemini-1.5-flash',
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'application/pdf',
              data: base64
            }
          }
        ]
      }]
    });

    return response.candidates[0].content.parts[0].text;
  } catch (err) {
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractDocxWithGemini(filePath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const prompt = `Extract all text from this Word document.
Return only the extracted text content, preserving structure where possible.
Do not add any commentary or explanations.`;

  try {
    const response = await requestJson({
      model: 'gemini-1.5-flash',
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              data: base64
            }
          }
        ]
      }]
    });

    return response.candidates[0].content.parts[0].text;
  } catch (err) {
    throw new Error(`DOCX extraction failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractImageWithGemini(filePath: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(filePath, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const prompt = `Extract all visible text from this image using OCR.
Return only the extracted text, maintaining the reading order.
If there's no text, return "No text found in image".
Do not add any commentary or explanations.`;

  try {
    // Detect mime type from file extension
    const ext = filePath.toLowerCase().split('.').pop();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';

    const response = await requestJson({
      model: 'gemini-1.5-flash',
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64
            }
          }
        ]
      }]
    });

    return response.candidates[0].content.parts[0].text;
  } catch (err) {
    throw new Error(`Image OCR failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
