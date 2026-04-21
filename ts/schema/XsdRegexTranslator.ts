/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

class CharClassItem {
    isComplement: boolean;
    content: string;

    constructor(isComplement: boolean, content: string) {
        this.isComplement = isComplement;
        this.content = content;
    }
}

export class XsdRegexTranslator {

    // \i  — NameStartChar (XML 1.0 §2.3, production [4])
    // Covers: ":" | [A-Z] | "_" | [a-z] | [#xC0-#xD6] | [#xD8-#xF6] |
    //         [#xF8-#x2FF] | [#x370-#x37D] | [#x37F-#x1FFF] |
    //         [#x200C-#x200D] | [#x2070-#x218F] | [#x2C00-#x2FEF] |
    //         [#x3001-#xD7FF] | [#xF900-#xFDCF] | [#xFDF0-#xFFFD] |
    //         [#x10000-#xEFFFF]
    private static readonly NAME_START_CHAR =
        ':A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF' +
        '\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F' +
        '\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD' +
        '\u{10000}-\u{EFFFF}';

    // NameChar adds to NameStartChar: "-" | "." | [0-9] | #xB7 |
    //   [#x0300-#x036F] | [#x203F-#x2040]
    private static readonly NAME_CHAR = XsdRegexTranslator.NAME_START_CHAR +
        '\\-\\.0-9\u00B7\u0300-\u036F\u203F-\u2040';

    private static readonly CATEGORY_MAP: Record<string, string> = {
        // Letter
        L: '\\p{L}', Lu: '\\p{Lu}', Ll: '\\p{Ll}', Lt: '\\p{Lt}',
        Lm: '\\p{Lm}', Lo: '\\p{Lo}',
        // Mark
        M: '\\p{M}', Mn: '\\p{Mn}', Mc: '\\p{Mc}', Me: '\\p{Me}',
        // Number
        N: '\\p{N}', Nd: '\\p{Nd}', Nl: '\\p{Nl}', No: '\\p{No}',
        // Punctuation
        P: '\\p{P}', Pc: '\\p{Pc}', Pd: '\\p{Pd}', Ps: '\\p{Ps}',
        Pe: '\\p{Pe}', Pi: '\\p{Pi}', Pf: '\\p{Pf}', Po: '\\p{Po}',
        // Symbol
        S: '\\p{S}', Sm: '\\p{Sm}', Sc: '\\p{Sc}', Sk: '\\p{Sk}',
        So: '\\p{So}',
        // Separator
        Z: '\\p{Z}', Zs: '\\p{Zs}', Zl: '\\p{Zl}', Zp: '\\p{Zp}',
        // Other
        C: '\\p{C}', Cc: '\\p{Cc}', Cf: '\\p{Cf}', Co: '\\p{Co}',
        Cn: '\\p{Cn}',
    };

    private static readonly BLOCK_MAP: Record<string, string> = {
        BasicLatin: '\u0000-\u007F',
        Latin1Supplement: '\u0080-\u00FF',
        'Latin-1Supplement': '\u0080-\u00FF',
        LatinExtendedA: '\u0100-\u017F',
        'LatinExtended-A': '\u0100-\u017F',
        LatinExtendedB: '\u0180-\u024F',
        'LatinExtended-B': '\u0180-\u024F',
        IPAExtensions: '\u0250-\u02AF',
        SpacingModifierLetters: '\u02B0-\u02FF',
        CombiningDiacriticalMarks: '\u0300-\u036F',
        Greek: '\u0370-\u03FF',
        GreekandCoptic: '\u0370-\u03FF',
        Cyrillic: '\u0400-\u04FF',
        CyrillicSupplement: '\u0500-\u052F',
        Armenian: '\u0530-\u058F',
        Hebrew: '\u0590-\u05FF',
        Arabic: '\u0600-\u06FF',
        Syriac: '\u0700-\u074F',
        Thaana: '\u0780-\u07BF',
        Devanagari: '\u0900-\u097F',
        Bengali: '\u0980-\u09FF',
        Gurmukhi: '\u0A00-\u0A7F',
        Gujarati: '\u0A80-\u0AFF',
        Oriya: '\u0B00-\u0B7F',
        Tamil: '\u0B80-\u0BFF',
        Telugu: '\u0C00-\u0C7F',
        Kannada: '\u0C80-\u0CFF',
        Malayalam: '\u0D00-\u0D7F',
        Sinhala: '\u0D80-\u0DFF',
        Thai: '\u0E00-\u0E7F',
        Lao: '\u0E80-\u0EFF',
        Tibetan: '\u0F00-\u0FFF',
        Myanmar: '\u1000-\u109F',
        Georgian: '\u10A0-\u10FF',
        HangulJamo: '\u1100-\u11FF',
        Ethiopic: '\u1200-\u137F',
        Cherokee: '\u13A0-\u13FF',
        UnifiedCanadianAboriginalSyllabics: '\u1400-\u167F',
        Ogham: '\u1680-\u169F',
        Runic: '\u16A0-\u16FF',
        Khmer: '\u1780-\u17FF',
        Mongolian: '\u1800-\u18AF',
        LatinExtendedAdditional: '\u1E00-\u1EFF',
        GreekExtended: '\u1F00-\u1FFF',
        GeneralPunctuation: '\u2000-\u206F',
        SuperscriptsandSubscripts: '\u2070-\u209F',
        CurrencySymbols: '\u20A0-\u20CF',
        CombiningMarksforSymbols: '\u20D0-\u20FF',
        LetterlikeSymbols: '\u2100-\u214F',
        NumberForms: '\u2150-\u218F',
        Arrows: '\u2190-\u21FF',
        MathematicalOperators: '\u2200-\u22FF',
        MiscellaneousTechnical: '\u2300-\u23FF',
        ControlPictures: '\u2400-\u243F',
        OpticalCharacterRecognition: '\u2440-\u245F',
        EnclosedAlphanumerics: '\u2460-\u24FF',
        BoxDrawing: '\u2500-\u257F',
        BlockElements: '\u2580-\u259F',
        GeometricShapes: '\u25A0-\u25FF',
        MiscellaneousSymbols: '\u2600-\u26FF',
        Dingbats: '\u2700-\u27BF',
        BraillePatterns: '\u2800-\u28FF',
        CJKRadicalsSupplement: '\u2E80-\u2EFF',
        KangxiRadicals: '\u2F00-\u2FDF',
        IdeographicDescriptionCharacters: '\u2FF0-\u2FFF',
        CJKSymbolsandPunctuation: '\u3000-\u303F',
        Hiragana: '\u3040-\u309F',
        Katakana: '\u30A0-\u30FF',
        Bopomofo: '\u3100-\u312F',
        HangulCompatibilityJamo: '\u3130-\u318F',
        Kanbun: '\u3190-\u319F',
        BopomofoExtended: '\u31A0-\u31BF',
        EnclosedCJKLettersandMonths: '\u3200-\u32FF',
        CJKCompatibility: '\u3300-\u33FF',
        CJKUnifiedIdeographsExtensionA: '\u3400-\u4DBF',
        YijingHexagramSymbols: '\u4DC0-\u4DFF',
        CJKUnifiedIdeographs: '\u4E00-\u9FFF',
        YiSyllables: '\uA000-\uA48F',
        YiRadicals: '\uA490-\uA4CF',
        HangulSyllables: '\uAC00-\uD7AF',
        HighSurrogates: '\uD800-\uDB7F',
        HighPrivateUseSurrogates: '\uDB80-\uDBFF',
        LowSurrogates: '\uDC00-\uDFFF',
        PrivateUse: '\uE000-\uF8FF',
        CJKCompatibilityIdeographs: '\uF900-\uFAFF',
        AlphabeticPresentationForms: '\uFB00-\uFB4F',
        ArabicPresentationFormsA: '\uFB50-\uFDFF',
        'ArabicPresentationForms-A': '\uFB50-\uFDFF',
        CombiningHalfMarks: '\uFE20-\uFE2F',
        CJKCompatibilityForms: '\uFE30-\uFE4F',
        SmallFormVariants: '\uFE50-\uFE6F',
        ArabicPresentationFormsB: '\uFE70-\uFEFF',
        'ArabicPresentationForms-B': '\uFE70-\uFEFF',
        Specials: '\uFFF0-\uFFFF',
        HalfwidthandFullwidthForms: '\uFF00-\uFFEF',
        OldItalic: '\u{10300}-\u{1032F}',
        Gothic: '\u{10330}-\u{1034F}',
        Deseret: '\u{10400}-\u{1044F}',
        ByzantineMusicalSymbols: '\u{1D000}-\u{1D0FF}',
        MusicalSymbols: '\u{1D100}-\u{1D1FF}',
        MathematicalAlphanumericSymbols: '\u{1D400}-\u{1D7FF}',
        CJKUnifiedIdeographsExtensionB: '\u{20000}-\u{2A6DF}',
        CJKCompatibilityIdeographsSupplement: '\u{2F800}-\u{2FA1F}',
        Tags: '\u{E0000}-\u{E007F}',
    };

    public static toRegExp(xsdPattern: string): RegExp {
        const jsSource = XsdRegexTranslator.translate(xsdPattern);
        return new RegExp('^(?:' + jsSource + ')$', 'u');
    }

    public static translate(xsdPattern: string): string {
        return XsdRegexTranslator.parseExpression(xsdPattern, 0).result;
    }

    private static parseExpression(
        src: string,
        start: number,
        stopAt?: string   // optional single character that ends the expression
    ): { result: string; end: number } {
        let out = '';
        let i = start;

        while (i < src.length) {
            const ch = src[i];

            // Stop character (used when parsing inside groups)
            if (stopAt && ch === stopAt) {
                break;
            }

            if (ch === '\\') {
                const { result, end } = XsdRegexTranslator.parseEscape(src, i);
                out += result;
                i = end;
                continue;
            }

            if (ch === '[') {
                const { result, end } = XsdRegexTranslator.parseCharClass(src, i);
                out += result;
                i = end;
                continue;
            }

            if (ch === '.') {
                // XSD dot: any char except \n \r \x85 \u2028
                out += '[^\\n\\r\\x85\\u2028]';
                i++;
                continue;
            }

            if (ch === '(') {
                // Inline .NET flag groups: (?flags:...) where flags may include
                // n (explicit capture — no-op for matching), i, m, s.
                // Map (?n:...) → (?:...) since "n" only suppresses capture numbering.
                // All other inline-flag prefixes are passed through as-is (JS supports them).
                let prefix = '(';
                let bodyStart = i + 1;
                if (src[i + 1] === '?') {
                    const flagEnd = src.indexOf(':', i + 2);
                    if (flagEnd !== -1) {
                        const flags = src.substring(i + 2, flagEnd);
                        if (/^[nimsx]+$/.test(flags)) {
                            const jsFlags = flags.replace(/n/g, '');
                            prefix = jsFlags.length > 0 ? '(?' + jsFlags + ':' : '(?:';
                            bodyStart = flagEnd + 1;
                        }
                    }
                }
                const inner = XsdRegexTranslator.parseExpression(src, bodyStart, ')');
                if (src[inner.end] !== ')') {
                    throw new Error('XsdRegexTranslator: unmatched \'(\' at position ' + i);
                }
                out += prefix + inner.result + ')';
                i = inner.end + 1;
                continue;
            }

            // A '{' is a quantifier only when immediately followed by one or more digits.
            // Otherwise it is a literal character; find the closing '}' and escape both.
            if (ch === '{') {
                if (i + 1 < src.length && src[i + 1] >= '0' && src[i + 1] <= '9') {
                    out += '{';
                    i++;
                    continue;
                }
                const closeIdx: number = src.indexOf('}', i + 1);
                if (closeIdx !== -1) {
                    out += '\\{' + src.substring(i + 1, closeIdx) + '\\}';
                    i = closeIdx + 1;
                } else {
                    out += '\\{';
                    i++;
                }
                continue;
            }

            // Quantifiers, alternation, anchors — pass through as-is.
            // XSD has no anchors, but the characters |, *, +, ?, } are
            // the same as in JS.
            out += ch;
            i++;
        }

        return { result: out, end: i };
    }

    private static parseEscape(
        src: string,
        i: number   // points at the '\'
    ): { result: string; end: number } {
        const next = src[i + 1];

        switch (next) {
            // XSD-specific shorthand classes
            case 'i': return { result: '[' + XsdRegexTranslator.NAME_START_CHAR + ']', end: i + 2 };
            case 'I': return { result: '[^' + XsdRegexTranslator.NAME_START_CHAR + ']', end: i + 2 };
            case 'c': return { result: '[' + XsdRegexTranslator.NAME_CHAR + ']', end: i + 2 };
            case 'C': return { result: '[^' + XsdRegexTranslator.NAME_CHAR + ']', end: i + 2 };

            // XSD \s is narrower than JS \s — only U+0020, \t, \n, \r
            case 's': return { result: '[\\x20\\t\\n\\r]', end: i + 2 };
            case 'S': return { result: '[^\\x20\\t\\n\\r]', end: i + 2 };

            // XSD \d is any Unicode decimal digit (\p{Nd})
            case 'd': return { result: '\\p{Nd}', end: i + 2 };
            case 'D': return { result: '\\P{Nd}', end: i + 2 };

            // XSD \w excludes the characters that \i and \c cover;
            // per spec it is [#x0000-#x10FFFF]-[\p{P}\p{Z}\p{C}] which is
            // equivalent to [\p{L}\p{M}\p{N}\p{S}]
            case 'w': return { result: '[\\p{L}\\p{M}\\p{N}\\p{S}]', end: i + 2 };
            case 'W': return { result: '[^\\p{L}\\p{M}\\p{N}\\p{S}]', end: i + 2 };

            // Unicode category / block escapes
            case 'p': {
                const { name, end } = XsdRegexTranslator.readBracedName(src, i + 2);
                return { result: XsdRegexTranslator.translateCategory(name, false), end };
            }
            case 'P': {
                const { name, end } = XsdRegexTranslator.readBracedName(src, i + 2);
                return { result: XsdRegexTranslator.translateCategory(name, true), end };
            }

            // \- is a valid XSD identity escape but not in JS u-mode outside
            // a character class; map it to \x2D (literal hyphen).
            case '-': return { result: '\\x2D', end: i + 2 };

            // Everything else (including \n \r \t \\ \. etc.) is passed
            // through unchanged — JS understands them identically.
            default:
                return { result: '\\' + next, end: i + 2 };
        }
    }

    private static parseCharClass(
        src: string,
        start: number   // points at the opening '['
    ): { result: string; end: number } {
        let i = start + 1;
        const negate = src[i] === '^';
        if (negate) i++;

        // First pass: collect items as a typed list
        const items: CharClassItem[] = [];
        let subtracted: string | null = null;

        while (i < src.length && src[i] !== ']') {
            // Detect  -[  at current position: class subtraction
            if (src[i] === '-' && src[i + 1] === '[') {
                const inner = XsdRegexTranslator.parseCharClass(src, i + 1);
                subtracted = inner.result;
                i = inner.end;
                break;
            }

            if (src[i] === '\\') {
                const esc = XsdRegexTranslator.parseEscapeInsideClass(src, i);
                items.push(esc.item);
                i = esc.end;
            } else {
                items.push(new CharClassItem(false, src[i]));
                i++;
            }
        }

        // Consume closing ']'
        if (src[i] === ']') i++;

        const baseExpr = XsdRegexTranslator.emitCharClass(items, negate);

        if (subtracted === null) {
            return { result: baseExpr, end: i };
        }

        // Class subtraction:  [base-[sub]]
        // JS has no native subtraction syntax, so we implement it via a
        // lookahead: (?![sub])[base]  — but that only works outside a class.
        // We therefore convert to:  (?:(?!subtracted)[base])
        // which is semantically equivalent to one code-point matching.
        return {
            result: '(?:(?!' + subtracted + ')' + baseExpr + ')',
            end: i,
        };
    }

    private static emitCharClass(items: CharClassItem[], negate: boolean): string {
        const posContent = items.filter(it => !it.isComplement).map(it => it.content).join('');
        const compContents = items.filter(it => it.isComplement).map(it => it.content);

        if (compContents.length === 0) {
            return '[' + (negate ? '^' : '') + posContent + ']';
        }

        if (posContent === '' && compContents.length === 1) {
            return negate
                ? '[' + compContents[0] + ']'
                : '[^' + compContents[0] + ']';
        }

        if (posContent === '') {
            if (negate) {
                // Intersection of complement bases: (?=[c1])(?=[c2])...[cN]
                let result = '';
                for (let k = 0; k < compContents.length - 1; k++) {
                    result += '(?=[' + compContents[k] + '])';
                }
                return result + '[' + compContents[compContents.length - 1] + ']';
            }
            // Union of negated: (?:[^c1]|[^c2]|...)
            return '(?:' + compContents.map(c => '[^' + c + ']').join('|') + ')';
        }

        if (negate) {
            // ¬(P ∪ ¬C) = ¬P ∩ C  →  lookaheads for each C, then [^P]
            const lookaheads = compContents.map(c => '(?=[' + c + '])').join('');
            return lookaheads + '[^' + posContent + ']';
        }
        // P ∪ ¬C  →  (?:[P]|[^c1]|[^c2]|...)
        const parts: string[] = ['[' + posContent + ']'];
        compContents.forEach(c => parts.push('[^' + c + ']'));
        return '(?:' + parts.join('|') + ')';
    }

    private static parseEscapeInsideClass(
        src: string,
        i: number
    ): { item: CharClassItem; end: number } {
        const next = src[i + 1];

        switch (next) {
            case 'i': return { item: new CharClassItem(false, XsdRegexTranslator.NAME_START_CHAR), end: i + 2 };
            case 'I': return { item: new CharClassItem(true,  XsdRegexTranslator.NAME_START_CHAR), end: i + 2 };
            case 'c': return { item: new CharClassItem(false, XsdRegexTranslator.NAME_CHAR), end: i + 2 };
            case 'C': return { item: new CharClassItem(true,  XsdRegexTranslator.NAME_CHAR), end: i + 2 };
            case 's': return { item: new CharClassItem(false, '\\x20\\t\\n\\r'), end: i + 2 };
            case 'S': return { item: new CharClassItem(true,  '\\x20\\t\\n\\r'), end: i + 2 };
            case 'd': return { item: new CharClassItem(false, '\\p{Nd}'), end: i + 2 };
            case 'D': return { item: new CharClassItem(true,  '\\p{Nd}'), end: i + 2 };
            case 'w': return { item: new CharClassItem(false, '\\p{L}\\p{M}\\p{N}\\p{S}'), end: i + 2 };
            case 'W': return { item: new CharClassItem(true,  '\\p{L}\\p{M}\\p{N}\\p{S}'), end: i + 2 };
            case 'p': {
                const { name, end } = XsdRegexTranslator.readBracedName(src, i + 2);
                return { item: new CharClassItem(false, XsdRegexTranslator.resolveClassContent(name)), end };
            }
            case 'P': {
                const { name, end } = XsdRegexTranslator.readBracedName(src, i + 2);
                return { item: new CharClassItem(true,  XsdRegexTranslator.resolveClassContent(name)), end };
            }
            default:
                return { item: new CharClassItem(false, '\\' + next), end: i + 2 };
        }
    }

    private static translateCategory(name: string, negate: boolean): string {
        // Block escape: \p{IsXxx}
        if (name.startsWith('Is')) {
            const blockName = name.slice(2);
            const range = XsdRegexTranslator.BLOCK_MAP[blockName]
                ?? XsdRegexTranslator.BLOCK_MAP[blockName.replace(/-/g, '')];
            if (range) {
                return negate ? '[^' + range + ']' : '[' + range + ']';
            }
            throw new Error('XsdRegexTranslator: unknown Unicode block \'' + name + '\'');
        }

        // Category escape: must be in CATEGORY_MAP
        const mapped = XsdRegexTranslator.CATEGORY_MAP[name];
        if (mapped) {
            return negate ? mapped.replace('\\p{', '\\P{') : mapped;
        }

        throw new Error('XsdRegexTranslator: unknown Unicode category \'' + name + '\'');
    }

    private static resolveClassContent(name: string): string {
        if (name.startsWith('Is')) {
            const blockName = name.slice(2);
            const range = XsdRegexTranslator.BLOCK_MAP[blockName]
                ?? XsdRegexTranslator.BLOCK_MAP[blockName.replace(/-/g, '')];
            if (range) {
                return range;
            }
            throw new Error('XsdRegexTranslator: unknown Unicode block \'' + name + '\'');
        }
        const mapped = XsdRegexTranslator.CATEGORY_MAP[name];
        if (mapped) {
            return mapped;
        }
        throw new Error('XsdRegexTranslator: unknown Unicode category \'' + name + '\'');
    }

    private static readBracedName(
        src: string,
        i: number   // should point at '{'
    ): { name: string; end: number } {
        if (src[i] !== '{') {
            throw new Error(
                'XsdRegexTranslator: expected \'{\' after \\p/\\P at position ' + i
            );
        }
        const close = src.indexOf('}', i + 1);
        if (close === -1) {
            throw new Error(
                'XsdRegexTranslator: unterminated \\p{...} starting at position ' + i
            );
        }
        return { name: src.slice(i + 1, close), end: close + 1 };
    }
}
