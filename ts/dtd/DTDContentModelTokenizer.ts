/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
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
