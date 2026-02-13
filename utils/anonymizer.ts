
export interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontHeight: number;
}

export interface RedactionMatch {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
    type: string;
}





export function identifyRedactions(
    items: TextItem[],
    pageIndex: number,
    pageHeight: number,
    customWords: string[] = []
): RedactionMatch[] {
    const matches: RedactionMatch[] = [];

    // Improved Regexes
    // Email: Standard pattern
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;

    // Phone: Matches Spanish (9 chars starting with 6,7,8,9) and international formats
    const phoneRegex = /(?:(?:\+|00)34[\s.-]?)?[6789](?:[\s.-]?\d){8}/;

    // Generic fallback for other international numbers: +xx ...
    const internationalPhoneRegex = /\+(?:[0-9] ?){6,14}[0-9]/;



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


    }

    return matches;
}
