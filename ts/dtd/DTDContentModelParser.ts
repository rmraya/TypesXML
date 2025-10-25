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

import { XMLUtils } from "../XMLUtils";
import { DTDChoiceModel } from "./DTDChoiceModel";
import { DTDContentModel } from "./DTDContentModel";
import { DTDContentModelTokenizer, DTDToken } from "./DTDContentModelTokenizer";
import { DTDElementNameParticle } from "./DTDElementNameParticle";
import { DTDSequenceModel } from "./DTDSequenceModel";

export class DTDContentModelParser {
    private debug(msg: string) {
        if (process.env.DTD_DEBUG) {
            console.log('[DTDParser]', msg);
        }
    }
    // Parse a particle: group, mixed, or name
    private parseParticle(): DTDContentModel {
        this.debug('parseParticle: ' + JSON.stringify(this.peek()));
        const token = this.peek();
        if (!token) throw new Error('Unexpected end of content model');
        if (token.type === '(') {
            this.next(); // always consume '('
            const nextToken = this.peek();
            this.debug('After consuming (, next token: ' + JSON.stringify(nextToken));
            if (nextToken && nextToken.type === 'PCDATA') {
                this.debug('Dispatching to parseMixed');
                return this.parseMixed();
            } else {
                this.debug('Dispatching to parseGroup');
                return this.parseGroup();
            }
        } else if (token.type === 'NAME') {
            this.debug('Dispatching to parseNameParticle');
            return this.parseNameParticle();
        } else {
            throw new Error('Expected (, or NAME in particle');
        }
    }
    private tokens: DTDToken[];
    private pos: number = 0;

    constructor(input: string) {
        const tokenizer = new DTDContentModelTokenizer(input);
        this.tokens = tokenizer.tokenize();
    }

    parse(): DTDContentModel {
        if (this.tokens.length === 0) throw new Error('Empty content model');
        return this.parseParticle();
    }

    private parseGroup(): DTDContentModel {
        this.debug('parseGroup entry: ' + JSON.stringify(this.peek()));
        this.debug('parseGroup: ' + JSON.stringify(this.peek()));
        // Assumes '(' already consumed
        let particles: DTDContentModel[] = [];
        let separator: string | null = null;
        let expectParticle = true;
        let lastWasSeparator = false;
        while (true) {
            const token = this.peek();
            if (!token) throw new Error('Unexpected end of content model');
            if (token.type === ')') {
                // Allow single particle followed by ')'
                this.next(); // consume ')'
                break;
            }
            if (expectParticle) {
                // Handle mixed content: (#PCDATA|foo|bar)*
                if (token.type === 'PCDATA') {
                    return this.parseMixed();
                }
                let particle = this.parseParticle();
                if (!particle) throw new Error('Expected particle in group');
                particles.push(particle);
                expectParticle = false;
                lastWasSeparator = false;
            } else {
                if (token.type === ',' || token.type === '|') {
                    if (separator && separator !== token.type) {
                        throw new Error('Mixed separators in group');
                    }
                    separator = token.type;
                    this.next(); // consume separator
                    expectParticle = true;
                    lastWasSeparator = true;
                } else if (token.type === ')') {
                    this.next(); // consume ')'
                    break;
                } else {
                    throw new Error('Expected , | or ) in group');
                }
            }
        }
        if (particles.length === 0) throw new Error('Empty group not allowed');
        if (lastWasSeparator) {
            throw new Error('Trailing separator in group');
        }
        if (!separator && particles.length > 1) {
            throw new Error('Missing separator in group');
        }
        let cardinality = '';
        const nextToken = this.peek();
        if (nextToken && nextToken.type === 'cardinality') {
            cardinality = nextToken.value;
            this.next();
        }
        if (separator === '|') {
            const model = new DTDChoiceModel(particles);
            model.cardinality = cardinality;
            return model;
        } else if (separator === ',') {
            const model = new DTDSequenceModel(particles);
            model.cardinality = cardinality;
            return model;
        } else if (particles.length === 1) {
            if ('cardinality' in particles[0]) {
                (particles[0] as any).cardinality = cardinality;
            }
            return particles[0];
        } else {
            throw new Error('Invalid group structure');
        }
    }
    // Removed stray 'return model;' and misplaced closing brace

    private parseMixed(): DTDChoiceModel {
        this.debug('parseMixed entry: ' + JSON.stringify(this.peek()));
        this.debug('parseMixed: ' + JSON.stringify(this.peek()));
        this.expect('PCDATA');
        let choice = new DTDChoiceModel();
        choice.addChoice(new DTDElementNameParticle('#PCDATA'));
        while (this.match('|')) {
            this.expect('|');
            if (this.match('NAME')) {
                let name = this.expect('NAME').value;
                choice.addChoice(new DTDElementNameParticle(name));
            } else if (this.match('PCDATA')) {
                // Allow repeated #PCDATA in mixed content
                this.expect('PCDATA');
                choice.addChoice(new DTDElementNameParticle('#PCDATA'));
            } else {
                throw new Error('Expected NAME or #PCDATA in mixed content');
            }
        }
        this.expect(')');
        let cardinality = this.parseCardinality();
        // Accept (#PCDATA) and (#PCDATA|name|...)* as valid
        if (cardinality && cardinality !== '*') {
            throw new Error('Mixed content must end with )* or be (#PCDATA)');
        }
        choice.cardinality = cardinality;
        return choice;
    }

    private parseNameParticle(): DTDElementNameParticle {
        this.debug('parseNameParticle: ' + JSON.stringify(this.peek()));
        let name = this.expect('NAME').value;
        if (!XMLUtils.isValidNCName(name)) {
            throw new Error('Invalid XML name in content model: ' + name);
        }
        let cardinality = this.parseCardinality();
        return new DTDElementNameParticle(name, cardinality);
    }

    private parseCardinality(): string {
        if (this.match('*')) return this.expect('*').value;
        if (this.match('+')) return this.expect('+').value;
        if (this.match('?')) return this.expect('?').value;
        return '';
    }

    private match(type: string): boolean {
        return this.peek()?.type === type;
    }
    private peek(): DTDToken | undefined {
        return this.tokens[this.pos];
    }
    private expect(type: string): DTDToken {
        if (!this.match(type)) throw new Error('Expected ' + type + ', got ' + (this.peek()?.type || 'EOF'));
        const token = this.tokens[this.pos++];
        this.debug('expect(' + type + '): ' + JSON.stringify(token));
        return token;
    }

    private next(): DTDToken | undefined {
        const token = this.tokens[this.pos++];
        this.debug('next(): ' + JSON.stringify(token));
        return token;
    }
}
// End of class
