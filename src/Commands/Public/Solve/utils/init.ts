import { CTFEvent } from "../../../../Functions/ctftime-v2";
import { FetchCommandModel, CTFCacheModel } from "../../../../Database/connect";

// Interface for parsed fetch command
interface ParsedFetchCommand {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
}

// Parse fetch command from user input
function parseFetchCommand(fetchCommand: string): ParsedFetchCommand {
    try {
        // Clean the input string and extract fetch parameters
        const cleanCommand = fetchCommand.trim();
        
        // Extract URL from fetch("url", ...)
        const urlMatch = cleanCommand.match(/fetch\s*\(\s*["'](.*?)["']/);
        if (!urlMatch) {
            throw new Error("Could not extract URL from fetch command");
        }
        const url = urlMatch[1];
        
        // Extract options object
        const optionsMatch = cleanCommand.match(/fetch\s*\([^,]+,\s*(\{[\s\S]*\})\s*\)/);
        let method = 'GET';
        let headers: Record<string, string> = {};
        let body: string | undefined;
        
        if (optionsMatch) {
            try {
                // Parse the options object safely
                const optionsStr = optionsMatch[1];
                
                // Try to parse as JSON first (most common case)
                let options;
                try {
                    options = JSON.parse(optionsStr);
                } catch (jsonError) {
                    // If JSON parsing fails, try to extract values using regex
                    options = parseJavaScriptObject(optionsStr);
                }
                
                method = options.method || 'GET';
                headers = options.headers || {};
                body = options.body;
                
            } catch (error) {
                // If we can't parse options, just use defaults
                console.warn("Could not parse fetch options, using defaults:", error);
            }
        }
        
        return {
            url,
            method,
            headers,
            body
        };
    } catch (error) {
        throw new Error(`Failed to parse fetch command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Safely parse JavaScript object without using eval
function parseJavaScriptObject(objectStr: string): any {
    const result: any = {};
    
    // Extract method
    const methodMatch = objectStr.match(/"method"\s*:\s*"([^"]+)"/);
    if (methodMatch) {
        result.method = methodMatch[1];
    }
    
    // Extract body
    const bodyMatch = objectStr.match(/"body"\s*:\s*(null|"[^"]*")/);
    if (bodyMatch) {
        result.body = bodyMatch[1] === 'null' ? null : bodyMatch[1].slice(1, -1); // Remove quotes
    }
    
    // Extract headers (more complex parsing to handle nested quotes)
    const headersMatch = objectStr.match(/"headers"\s*:\s*\{([\s\S]*?)\}(?:\s*,|\s*$|\s*\})/);
    if (headersMatch) {
        const headersStr = headersMatch[1];
        const headers: Record<string, string> = {};
        
        // More sophisticated regex to handle escaped quotes in header values
        // This regex matches "key": "value" where value can contain escaped quotes
        const headerMatches = headersStr.match(/"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
        if (headerMatches) {
            headerMatches.forEach(match => {
                const keyValueMatch = match.match(/"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                if (keyValueMatch) {
                    // Unescape the header value
                    const key = keyValueMatch[1];
                    const value = keyValueMatch[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                    headers[key] = value;
                }
            });
        }
        result.headers = headers;
    }
    
    return result;
}

// Save fetch command to database
async function saveFetchCommand(
    parsedFetch: ParsedFetchCommand, 
    ctfData: CTFEvent, 
    channelId: string, 
    platform: string
) {
    try {
        // Find the CTF in the cache to get its ObjectId
        const ctfCache = await CTFCacheModel.findOne({ ctf_id: ctfData.id.toString() });
        if (!ctfCache) {
            throw new Error(`CTF with id ${ctfData.id} not found in cache`);
        }
        
        const existingCommand = await FetchCommandModel.findOne({ 
            ctf: ctfCache._id,
            channel_id: channelId 
        });
        
        if (existingCommand) {
            existingCommand.url = parsedFetch.url;
            existingCommand.method = parsedFetch.method;
            existingCommand.headers = parsedFetch.headers;
            if (parsedFetch.body) {
                existingCommand.body = parsedFetch.body;
            }
            existingCommand.platform = platform;
            existingCommand.is_active = true;
            await existingCommand.save();
        } else {
            const fetchCommandData: any = {
                ctf: ctfCache._id,
                channel_id: channelId,
                url: parsedFetch.url,
                method: parsedFetch.method,
                headers: parsedFetch.headers,
                platform: platform,
                is_active: true
            };
            
            if (parsedFetch.body) {
                fetchCommandData.body = parsedFetch.body;
            }
            
            const fetchCommandDoc = new FetchCommandModel(fetchCommandData);
            await fetchCommandDoc.save();
            
        }
    } catch (error) {
        throw new Error(`Failed to save fetch command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}



export { parseFetchCommand, ParsedFetchCommand, saveFetchCommand };