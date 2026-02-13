
export interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontHeight: number;
}

export function getInitials(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase();
}

export function detectCandidateName(items: TextItem[]): string | null {
    if (!items || items.length === 0) return null;

    const stopWords = [
        'curriculum', 'vitae', 'resume', 'cv', 'hoja', 'de', 'vida',
        'perfil', 'profesional', 'autobiografia', 'datos', 'personales',
        'contacto', 'experiencia', 'educación', 'formación', 'información',
        'personal', 'laboral', 'académica', 'sobre', 'mí', 'mi', 'resumen'
    ];

    const nameLabels = ['nombre', 'name', 'candidato', 'postulante', 'nombres', 'apellidos', 'fullname', 'full name'];

    // 0. Pre-process: Group by lines to help with label detection
    const lines: { y: number; items: TextItem[] }[] = [];
    const yTolerance = 5;

    // Use top 40% of page for name search to be safe
    const searchItems = items.filter(item => item.y > 400);

    for (const item of searchItems) {
        const existingLine = lines.find(line => Math.abs(line.y - item.y) < yTolerance);
        if (existingLine) {
            existingLine.items.push(item);
        } else {
            lines.push({ y: item.y, items: [item] });
        }
    }

    // Sort lines by Y (top to bottom? PDF Y is usually bottom-up, so descending Y is top-down)
    lines.sort((a, b) => b.y - a.y);

    // 1. Label-based Detection
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Sort items in line by X
        line.items.sort((a, b) => a.x - b.x);

        for (let j = 0; j < line.items.length; j++) {
            const item = line.items[j];
            const text = item.str.trim();
            const lowerText = text.toLowerCase().replace(/[:.]/g, ''); // remove colon and dots for comparison

            // Case A: The item IS the label (e.g. "Nombre")
            if (nameLabels.includes(lowerText)) {
                // Found a label!
                // Look for value in same line to the right
                if (j + 1 < line.items.length) {
                    const nextItem = line.items[j + 1];
                    // return next item as name
                    return nextItem.str.trim();
                }

                // Look for value in next line (i+1)
                if (i + 1 < lines.length) {
                    const nextLine = lines[i + 1];
                    const valueItem = nextLine.items.find(it => Math.abs(it.x - item.x) < 50) || nextLine.items[0];
                    if (valueItem) {
                        return valueItem.str.trim();
                    }
                }
            }

            // Case B: The item CONTAINS the label (e.g. "Nombre: Manuel Bago")
            for (const label of nameLabels) {
                // Check if it starts with the label
                // We use a regex to ensure "Nombres" doesn't match "Nombre" if strictly "Nombre" is checking
                // But here checking startsWith is usually enough if we are careful
                const regex = new RegExp(`^${label}\\s*[:.]?\\s+`, 'i');
                if (regex.test(text)) {
                    // Extract the part after the label
                    const value = text.replace(regex, '').trim();
                    if (value.length > 2) {
                        return value;
                    }
                }
            }
        }
    }


    // 2. Fallback: Heuristic (Largest Candidate)

    // Merge items within lines based on X-proximity
    const candidates: { text: string; fontHeight: number; y: number }[] = [];

    for (const line of lines) {
        // Sort items by X position
        line.items.sort((a, b) => a.x - b.x);

        if (line.items.length === 0) continue;

        let currentMerged = line.items[0].str;
        let currentFontHeight = line.items[0].fontHeight;
        let currentXEnd = line.items[0].x + line.items[0].width;

        for (let i = 1; i < line.items.length; i++) {
            const item = line.items[i];
            const distance = item.x - currentXEnd;

            // merging distance tolerance (e.g. 20px)
            if (distance < 25) {
                currentMerged += ' ' + item.str;
                currentXEnd = item.x + item.width;
                // keep max font height of the group
                currentFontHeight = Math.max(currentFontHeight, item.fontHeight);
            } else {
                // Push previous group and start new
                candidates.push({ text: currentMerged, fontHeight: currentFontHeight, y: line.y });
                currentMerged = item.str;
                currentFontHeight = item.fontHeight;
                currentXEnd = item.x + item.width;
            }
        }
        // Push the last group
        candidates.push({ text: currentMerged, fontHeight: currentFontHeight, y: line.y });
    }

    // Score candidates
    let bestCandidate: string | null = null;
    let maxScore = -1;

    for (const cand of candidates) {
        const text = cand.text.trim();
        const lowerText = text.toLowerCase();

        // Filters
        if (text.length < 3) continue;
        if (lowerText.includes('@')) continue; // Email
        if (/\d/.test(text)) continue; // Contains numbers (address/phone?)

        // Check against stopwords
        // If the ENTIRE text is a stopword or mostly stopwords, discard.
        const words = lowerText.split(/\s+/);
        const isStopWord = words.every(w => stopWords.some(sw => w.includes(sw)));
        if (isStopWord) continue;

        // Clean leading/trailing non-letters
        const cleanText = text.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
        if (cleanText.length < 3) continue;

        // Score: FontHeight * 100 + Y-Position
        // We only considered top 40% (y > 400 usually). 
        // 100 multiplier makes 1pt font difference = 100px Y difference.
        // A large title at y=700 (font 20) -> 2000 + 700 = 2700
        // A small text at y=800 (font 10) -> 1000 + 800 = 1800
        const score = (cand.fontHeight * 100) + cand.y;

        if (score > maxScore) {
            maxScore = score;
            bestCandidate = cleanText;
        }
    }

    return bestCandidate;
}

export function identifyRedactions(
    items: TextItem[],
    pageIndex: number,
    pageHeight: number,
    candidateName?: string,
    customWords: string[] = []
): any[] {
    const matches: any[] = [];

    // Improved Regexes
    // Email: Standard pattern
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;

    // Phone: Matches Spanish (9 chars starting with 6,7,8,9) and international formats
    const phoneRegex = /(?:(?:\+|00)34[\s.-]?)?[6789](?:[\s.-]?\d){8}/;

    // Generic fallback for other international numbers: +xx ...
    const internationalPhoneRegex = /\+(?:[0-9] ?){6,14}[0-9]/;

    // Prepare name parts for partial matching
    const nameParts = candidateName
        ? candidateName.split(/\s+/).filter(part => part.length >= 3).map(p => p.toLowerCase())
        : [];

    // Prepare custom words
    const processedCustomWords = customWords
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0);

    for (const item of items) {
        const text = item.str;
        const lowerText = text.toLowerCase();

        // check for custom words
        for (const word of processedCustomWords) {
            if (lowerText.includes(word)) {
                matches.push({
                    x: item.x, y: item.y, width: item.width, height: item.height,
                    text: text, type: 'custom'
                });
                // If matched custom word, maybe we don't need to check others?
                // But let's allow multiple matches if they overlap or whatever,
                // though here we push the whole item box.
                break;
            }
        }

        // check for email
        if (emailRegex.test(text)) {
            matches.push({
                x: item.x, y: item.y, width: item.width, height: item.height,
                text: text, type: 'email'
            });
            continue;
        }

        // check for phone (Spanish or International)
        if (phoneRegex.test(text) || internationalPhoneRegex.test(text)) {
            matches.push({
                x: item.x, y: item.y, width: item.width, height: item.height,
                text: text, type: 'phone'
            });
            continue;
        }

        // check for candidate name
        if (candidateName) {
            // Full match
            if (lowerText.includes(candidateName.toLowerCase())) {
                matches.push({
                    x: item.x, y: item.y, width: item.width, height: item.height,
                    text: text, type: 'name'
                });
                continue;
            }

            // Partial match (parts of the name)
            // Be careful to match whole words if possible, or substantial overlaps
            for (const part of nameParts) {
                // Check if the text item IS the name part or Contains it as a distinct word
                // \b boundary check is tricky with non-ascii or if item is just the word
                // Simple includes for now but verify length
                if (lowerText.includes(part)) {
                    matches.push({
                        x: item.x, y: item.y, width: item.width, height: item.height,
                        text: text, type: 'name-partial'
                    });
                    break; // once matched, no need to check other parts for this item
                }
            }
        }
    }

    return matches;
}
