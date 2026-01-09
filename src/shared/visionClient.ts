/**
 * Vision Model Client
 * 
 * Uses screenshot + bounding boxes to find elements visually.
 * Useful when DOM selectors are unreliable or pages use heavy obfuscation.
 * 
 * Supports:
 * - Ollama: LLaVA, Qwen2-VL, BakLLaVA
 * - LM Studio / OpenAI-compatible: GLM-4.6V-Flash, Qwen2-VL, LLaVA, etc.
 */

import { loadLlmConfig } from './storage';

export interface ElementBox {
    id: number;
    selector: string;
    rect: { x: number; y: number; w: number; h: number };
    text?: string;
    role?: string;
}

export interface VisionRequest {
    task: string;
    screenshot: string; // base64 data URL
    boxes: ElementBox[];
}

export interface VisionResponse {
    boxId: number;
    confidence: number;
    reasoning?: string;
}

/**
 * Detect API format (Ollama vs OpenAI-compatible)
 */
function detectApiFormat(baseUrl: string): 'ollama' | 'openai' {
    // Check if URL contains common OpenAI-compatible endpoints
    if (baseUrl.includes('/v1') || baseUrl.includes('lmstudio') || baseUrl.includes('localhost:1234')) {
        return 'openai';
    }
    // Default to Ollama for localhost:11434
    if (baseUrl.includes('localhost:11434') || baseUrl.includes('ollama')) {
        return 'ollama';
    }
    // Try OpenAI-compatible first (LM Studio default)
    return 'openai';
}

/**
 * Convert base64 data URL to base64 string (remove data:image/jpeg;base64, prefix)
 */
function extractBase64(dataUrl: string): string {
    if (dataUrl.startsWith('data:')) {
        const commaIndex = dataUrl.indexOf(',');
        return commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
    }
    return dataUrl;
}

/**
 * Find element by vision (screenshot + VLM)
 * Supports both Ollama and LM Studio (OpenAI-compatible) APIs
 */
export async function findElementByVision(
    task: string,
    screenshot: string,
    boundingBoxes: ElementBox[],
    baseUrl?: string,
    modelName?: string,
    apiKey?: string
): Promise<VisionResponse> {
    // Load config if not provided
    if (!baseUrl || !modelName) {
        const cfg = await loadLlmConfig();
        baseUrl = baseUrl || cfg.baseUrl || 'http://localhost:1234';
        modelName = modelName || cfg.model || 'glm-4.6v-flash';
        apiKey = apiKey || cfg.apiKey;
    }

    // Annotate screenshot with numbered boxes
    const annotated = await annotateScreenshot(screenshot, boundingBoxes);
    const base64Image = extractBase64(annotated);

    // Build prompt
    const boxDescriptions = boundingBoxes
        .map((box, idx) => `Box ${idx + 1}: ${box.text || box.role || 'element'} at (${box.rect.x}, ${box.rect.y})`)
        .join('\n');

    const prompt = `You are helping with web automation. The user wants to: "${task}"

I've marked ${boundingBoxes.length} interactive elements on this screenshot with numbered red boxes.

Elements:
${boxDescriptions}

Which box number should I interact with to accomplish the task? Reply with ONLY the box number (e.g., "5"), nothing else.`;

    const apiFormat = detectApiFormat(baseUrl);
    const cleanBaseUrl = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');

    try {
        let response: Response;
        let data: any;
        let content: string;

        if (apiFormat === 'ollama') {
            // Ollama API format
            response = await fetch(`${cleanBaseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                            images: [annotated]
                        }
                    ],
                    stream: false,
                    options: {
                        temperature: 0.1,
                        num_predict: 10
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }

            data = await response.json();
            content = data.message?.content || '';
        } else {
            // OpenAI-compatible API format (LM Studio, etc.)
            response = await fetch(`${cleanBaseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: prompt
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 50
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Vision API error: ${response.status} ${errorText}`);
            }

            data = await response.json();
            content = data.choices?.[0]?.message?.content || '';
        }

        // Parse box number from response
        const match = content.match(/\b(\d+)\b/);
        if (!match) {
            throw new Error(`Could not parse box number from response: ${content}`);
        }

        const boxId = parseInt(match[1], 10);
        if (boxId < 1 || boxId > boundingBoxes.length) {
            throw new Error(`Invalid box ID ${boxId} (valid range: 1-${boundingBoxes.length})`);
        }

        return {
            boxId,
            confidence: 0.8, // Vision models are generally confident
            reasoning: content
        };
    } catch (error) {
        throw new Error(`Vision model failed: ${error}`);
    }
}

/**
 * Annotate screenshot with numbered bounding boxes
 * Returns base64 data URL of annotated image
 */
async function annotateScreenshot(
    screenshotDataUrl: string,
    boxes: ElementBox[]
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Draw boxes and numbers
            boxes.forEach((box, idx) => {
                const { x, y, w, h } = box.rect;

                // Draw red box
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, w, h);

                // Draw number label
                const label = `${idx + 1}`;
                const labelSize = 24;
                ctx.font = `bold ${labelSize}px Arial`;
                ctx.fillStyle = '#FF0000';
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;

                // Position label in top-left corner of box
                const labelX = x + 5;
                const labelY = y + labelSize;

                // White outline for readability
                ctx.strokeText(label, labelX, labelY);
                ctx.fillText(label, labelX, labelY);
            });

            // Convert to data URL
            const annotatedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve(annotatedDataUrl);
        };

        img.onerror = () => reject(new Error('Failed to load screenshot'));
        img.src = screenshotDataUrl;
    });
}

/**
 * Capture screenshot with bounding boxes
 * Call from panel.ts context (has access to chrome.tabs)
 */
export async function captureScreenshotWithBoxes(
    tabId: number,
    snapshot: any
): Promise<{ screenshot: string; boxes: ElementBox[] }> {
    // Capture screenshot
    const screenshot = await chrome.tabs.captureVisibleTab(undefined, {
        format: 'jpeg',
        quality: 85
    });

    // Extract boxes from snapshot
    const boxes: ElementBox[] = (snapshot.elements || [])
        .filter((el: any) => el.rect && el.rect.w > 10 && el.rect.h > 10)
        .slice(0, 50) // Limit to top 50 elements
        .map((el: any, idx: number) => ({
            id: idx + 1,
            selector: el.guess || '',
            rect: el.rect,
            text: (el.text || '').slice(0, 50),
            role: el.tag
        }));

    return { screenshot, boxes };
}

/**
 * Check if vision model is available
 * Supports both Ollama and LM Studio (OpenAI-compatible) APIs
 */
export async function isVisionModelAvailable(baseUrl?: string, modelName?: string, apiKey?: string): Promise<boolean> {
    // Load config if not provided
    if (!baseUrl || !modelName) {
        const cfg = await loadLlmConfig();
        baseUrl = baseUrl || cfg.baseUrl || 'http://localhost:1234';
        modelName = modelName || cfg.model;
        apiKey = apiKey || cfg.apiKey;
    }

    if (!baseUrl) return false;

    const apiFormat = detectApiFormat(baseUrl);
    const cleanBaseUrl = baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');

    try {
        if (apiFormat === 'ollama') {
            // Ollama API: check /api/tags
            const response = await fetch(`${cleanBaseUrl}/api/tags`, {
                method: 'GET'
            });

            if (!response.ok) return false;

            const data = await response.json();
            const models = data.models || [];

            return models.some((m: any) => {
                const name = (m.name || '').toLowerCase();
                return name.includes('llava') || 
                       name.includes('qwen2-vl') || 
                       name.includes('bakllava') ||
                       name.includes('glm-4.6v') ||
                       name.includes('glm-4-v') ||
                       name.includes('vision');
            });
        } else {
            // OpenAI-compatible API: try listing models or test with a simple call
            // LM Studio doesn't have a standard model list endpoint, so we'll try a test call
            if (modelName) {
                // Try a simple test to see if the model responds
                const testResponse = await fetch(`${cleanBaseUrl}/v1/models`, {
                    method: 'GET',
                    headers: {
                        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                    }
                });

                if (testResponse.ok) {
                    const modelsData = await testResponse.json();
                    const models = modelsData.data || modelsData.models || [];
                    const modelNames = models.map((m: any) => (m.id || m.name || '').toLowerCase());
                    
                    return modelNames.some(name => 
                        name.includes('glm-4.6v') ||
                        name.includes('glm-4-v') ||
                        name.includes('llava') ||
                        name.includes('qwen2-vl') ||
                        name.includes('vision') ||
                        name === modelName.toLowerCase()
                    );
                }
            }
            
            // If model name is provided, assume it's available (user knows what they're doing)
            return !!modelName;
        }
    } catch {
        // If we can't check, assume available if model name is provided
        return !!modelName;
    }
}

