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

    // \i — NameStartChar (XML 1.0 Second Edition, Appendix B, productions [84][85][86])
    private static readonly NAME_START_CHAR =
        ':A-Z_a-z' +
        '\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF' +
        '\u0100-\u0131\u0134-\u013E\u0141-\u0148\u014A-\u017E' +
        '\u0180-\u01C3\u01CD-\u01F0\u01F4-\u01F5\u01FA-\u0217' +
        '\u0250-\u02A8\u02BB-\u02C1' +
        '\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03CE' +
        '\u03D0-\u03D6\u03DA\u03DC\u03DE\u03E0\u03E2-\u03F3' +
        '\u0401-\u040C\u040E-\u044F\u0451-\u045C\u045E-\u0481' +
        '\u0490-\u04C4\u04C7-\u04C8\u04CB-\u04CC\u04D0-\u04EB' +
        '\u04EE-\u04F5\u04F8-\u04F9' +
        '\u0531-\u0556\u0559\u0561-\u0586' +
        '\u05D0-\u05EA\u05F0-\u05F2' +
        '\u0621-\u063A\u0641-\u064A' +
        '\u0671-\u06B7\u06BA-\u06BE\u06C0-\u06CE\u06D0-\u06D3\u06D5\u06E5-\u06E6' +
        '\u0905-\u0939\u093D\u0958-\u0961' +
        '\u0985-\u098C\u098F-\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9' +
        '\u09DC-\u09DD\u09DF-\u09E1\u09F0-\u09F1' +
        '\u0A05-\u0A0A\u0A0F-\u0A10\u0A13-\u0A28\u0A2A-\u0A30' +
        '\u0A32-\u0A33\u0A35-\u0A36\u0A38-\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74' +
        '\u0A85-\u0A8B\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0' +
        '\u0AB2-\u0AB3\u0AB5-\u0AB9\u0ABD\u0AE0' +
        '\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30' +
        '\u0B32-\u0B33\u0B36-\u0B39\u0B3D\u0B5C-\u0B5D\u0B5F-\u0B61' +
        '\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99-\u0B9A\u0B9C' +
        '\u0B9E-\u0B9F\u0BA3-\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB5\u0BB7-\u0BB9' +
        '\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C33\u0C35-\u0C39\u0C60-\u0C61' +
        '\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CDE\u0CE0-\u0CE1' +
        '\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D28\u0D2A-\u0D39\u0D60-\u0D61' +
        '\u0E01-\u0E2E\u0E30\u0E32-\u0E33\u0E40-\u0E45' +
        '\u0E81-\u0E82\u0E84\u0E87-\u0E88\u0E8A\u0E8D' +
        '\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA-\u0EAB' +
        '\u0EAD-\u0EAE\u0EB0\u0EB2-\u0EB3\u0EBD\u0EC0-\u0EC4' +
        '\u0F40-\u0F47\u0F49-\u0F69' +
        '\u10A0-\u10C5\u10D0-\u10F6\u1100\u1102-\u1103\u1105-\u1107\u1109' +
        '\u110B-\u110C\u110E-\u1112\u113C\u113E\u1140\u114C\u114E\u1150' +
        '\u1154-\u1155\u1159\u115F-\u1161\u1163\u1165\u1167\u1169\u116D-\u116E' +
        '\u1172-\u1173\u1175\u119E\u11A8\u11AB\u11AE-\u11AF\u11B7-\u11B8\u11BA' +
        '\u11BC-\u11C2\u11EB\u11F0\u11F9' +
        '\u1E00-\u1E9B\u1EA0-\u1EF9' +
        '\u1F00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57' +
        '\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE' +
        '\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC' +
        '\u1FF2-\u1FF4\u1FF6-\u1FFC' +
        '\u2126\u212A-\u212B\u212E\u2180-\u2182' +
        '\u3041-\u3094\u30A1-\u30FA\u3105-\u312C\uAC00-\uD7A3' +
        '\u4E00-\u9FA5\u3007\u3021-\u3029';

    // \c — NameChar (XML 1.0 Second Edition, Appendix B, productions [4][87][88][89])
    private static readonly NAME_CHAR = XsdRegexTranslator.NAME_START_CHAR +
        '\\-\\.0-9' +
        '\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF' +
        '\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE7-\u0BEF' +
        '\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0E50-\u0E59' +
        '\u0ED0-\u0ED9\u0F20-\u0F29' +
        '\u0300-\u0345\u0360-\u0361\u0483-\u0486\u0591-\u05A1' +
        '\u05A3-\u05B9\u05BB-\u05BD\u05BF\u05C1-\u05C2\u05C4' +
        '\u064B-\u0652\u0670\u06D6-\u06DC\u06DD-\u06DF\u06E0-\u06E4' +
        '\u06E7-\u06E8\u06EA-\u06ED\u0901-\u0903\u093C\u093E-\u094C' +
        '\u094D\u0951-\u0954\u0962-\u0963\u0981-\u0983\u09BC\u09BE' +
        '\u09BF\u09C0-\u09C4\u09C7-\u09C8\u09CB-\u09CD\u09D7\u09E2-\u09E3' +
        '\u0A02\u0A3C\u0A3E\u0A3F\u0A40-\u0A42\u0A47-\u0A48\u0A4B-\u0A4D' +
        '\u0A70-\u0A71\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD' +
        '\u0B01-\u0B03\u0B3C\u0B3E-\u0B43\u0B47-\u0B48\u0B4B-\u0B4D' +
        '\u0B56-\u0B57\u0B82-\u0B83\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD' +
        '\u0BD7\u0C01-\u0C03\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55-\u0C56' +
        '\u0C82-\u0C83\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5-\u0CD6' +
        '\u0D02-\u0D03\u0D3E-\u0D43\u0D46-\u0D48\u0D4A-\u0D4D\u0D57' +
        '\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB-\u0EBC' +
        '\u0EC8-\u0ECD\u0F18-\u0F19\u0F35\u0F37\u0F39\u0F3E\u0F3F' +
        '\u0F71-\u0F84\u0F86-\u0F8B\u0F90-\u0F95\u0F97\u0F99-\u0FAD' +
        '\u0FB1-\u0FB7\u0FB9\u20D0-\u20DC\u20E1\u302A-\u302F\u3099\u309A' +
        '\u00B7\u02D0\u02D1\u0387\u0640\u0E46\u0EC6\u3005' +
        '\u3031-\u3035\u309D-\u309E\u30FC-\u30FE';

    // XSD 1.0 \d is a fixed set of 20 decimal-digit ranges frozen at Unicode 3.1.
    // Using \p{Nd} would reflect current Unicode, which diverges: e.g. U+0BE6 was added
    // to Nd after Unicode 3.1, and U+1369-U+1371 were removed in Unicode 6.0.
    private static readonly XSD_DIGITS =
        '\\u0030-\\u0039\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F' +
        '\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F' +
        '\\u0BE7-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F' +
        '\\u0E50-\\u0E59\\u0ED0-\\u0ED9\\u0F20-\\u0F29\\u1040-\\u1049' +
        '\\u1369-\\u1371\\u17E0-\\u17E9\\u1810-\\u1819\\uFF10-\\uFF19' +
        '\\u{1D7CE}-\\u{1D7FF}';

    // Characters assigned to L/M/N/S after Unicode 3.1 that must be excluded from \w.
    // XSD 1.0 \w is defined against Unicode 3.1; these were Cn (unassigned) at that time.
    private static readonly XSD_W_EXCLUDES = '\\u023F-\\u0240';

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
                        const rawFlags = src.substring(i + 2, flagEnd);
                        const flags = rawFlags.startsWith('+') ? rawFlags.slice(1) : rawFlags;
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

            case 'd': return { result: '[' + XsdRegexTranslator.XSD_DIGITS + ']', end: i + 2 };
            case 'D': return { result: '[^' + XsdRegexTranslator.XSD_DIGITS + ']', end: i + 2 };

            // XSD \w excludes the characters that \i and \c cover;
            // per spec it is [#x0000-#x10FFFF]-[\p{P}\p{Z}\p{C}] which is
            // equivalent to [\p{L}\p{M}\p{N}\p{S}]
            case 'w': return { result: '(?:(?![' + XsdRegexTranslator.XSD_W_EXCLUDES + '])[\\p{L}\\p{M}\\p{N}\\p{S}])', end: i + 2 };
            case 'W': return { result: '(?:[^\\p{L}\\p{M}\\p{N}\\p{S}]|[' + XsdRegexTranslator.XSD_W_EXCLUDES + '])', end: i + 2 };

            // Unicode category / block escapes
            case 'p': {
                const { name, end } = XsdRegexTranslator.readBracedName(src, i + 2);
                return { result: XsdRegexTranslator.translateCategory(name, false), end };
            }
            case 'P': {
                const { name, end } = XsdRegexTranslator.readBracedName(src, i + 2);
                return { result: XsdRegexTranslator.translateCategory(name, true), end };
            }

            // \A, \Z and \z are Perl/PCRE string-boundary anchors; toRegExp already
            // wraps the pattern with ^ and $ so all three are no-ops here.
            case 'A': return { result: '', end: i + 2 };
            case 'Z': return { result: '', end: i + 2 };
            case 'z': return { result: '', end: i + 2 };

            // \- is a valid XSD identity escape but not in JS u-mode outside
            // a character class; map it to \x2D (literal hyphen).
            case '-': return { result: '\\x2D', end: i + 2 };

            // Everything else (including \n \r \t \\ \. etc.) is passed
            // through unchanged — JS understands them identically.
            default: {
                if (next >= '0' && next <= '7') {
                    let j = i + 1;
                    let octalStr = '';
                    while (j < src.length && j < i + 4 && src[j] >= '0' && src[j] <= '7') {
                        octalStr += src[j];
                        j++;
                    }
                    const code = parseInt(octalStr, 8);
                    const hex = code <= 0xFF
                        ? '\\x' + code.toString(16).padStart(2, '0')
                        : '\\u' + code.toString(16).padStart(4, '0');
                    return { result: hex, end: j };
                }
                return { result: '\\' + next, end: i + 2 };
            }
        }
    }

    private static parseCharClass(
        src: string,
        start: number   // points at the opening '['
    ): { result: string; end: number } {
        let i = start + 1;
        const negate = src[i] === '^';
        if (negate) i++;

        if (src[i] === ']') {
            throw new Error('XsdRegexTranslator: empty character class at position ' + start);
        }

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

            if (src[i] === '[') {
                throw new Error('XsdRegexTranslator: unexpected \'[\' inside character class at position ' + i);
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
        if (src[i] !== ']') {
            throw new Error('XsdRegexTranslator: unterminated character class at position ' + start);
        }
        i++;

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
            case 'd': return { item: new CharClassItem(false, XsdRegexTranslator.XSD_DIGITS), end: i + 2 };
            case 'D': return { item: new CharClassItem(true,  XsdRegexTranslator.XSD_DIGITS), end: i + 2 };
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
            case 'A': return { item: new CharClassItem(false, ''), end: i + 2 };
            case 'Z': return { item: new CharClassItem(false, ''), end: i + 2 };
            case 'z': return { item: new CharClassItem(false, ''), end: i + 2 };
            default: {
                if (next >= '0' && next <= '7') {
                    let j = i + 1;
                    let octalStr = '';
                    while (j < src.length && j < i + 4 && src[j] >= '0' && src[j] <= '7') {
                        octalStr += src[j];
                        j++;
                    }
                    const code = parseInt(octalStr, 8);
                    const hex = code <= 0xFF
                        ? '\\x' + code.toString(16).padStart(2, '0')
                        : '\\u' + code.toString(16).padStart(4, '0');
                    return { item: new CharClassItem(false, hex), end: j };
                }
                return { item: new CharClassItem(false, '\\' + next), end: i + 2 };
            }
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
