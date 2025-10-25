/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

export type DTDToken = { type: string, value: string };

export class DTDContentModelTokenizer {
    private input: string;
    private pos: number = 0;
    private tokens: DTDToken[] = [];

    constructor(input: string) {
        this.input = input;
    }

    tokenize(): DTDToken[] {
        while (this.pos < this.input.length) {
            let c = this.input[this.pos];
            if (/\s/.test(c)) {
                this.pos++;
                continue;
            }
            if (c === '(' || c === ')' || c === ',' || c === '|' || c === '*' || c === '+' || c === '?') {
                this.tokens.push({ type: c, value: c });
                this.pos++;
                continue;
            }
            if (this.input.startsWith('#PCDATA', this.pos)) {
                this.tokens.push({ type: 'PCDATA', value: '#PCDATA' });
                this.pos += 7;
                continue;
            }
            // Element name
            let start = this.pos;
            while (this.pos < this.input.length && /[a-zA-Z0-9_.-]/.test(this.input[this.pos])) {
                this.pos++;
            }
            if (start !== this.pos) {
                let name = this.input.substring(start, this.pos);
                this.tokens.push({ type: 'NAME', value: name });
                continue;
            }
            throw new Error('Unexpected character in content model: ' + c);
        }
        return this.tokens;
    }
}
