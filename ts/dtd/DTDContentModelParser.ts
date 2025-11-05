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

import { XMLUtils } from "../XMLUtils";
import { DTDChoiceModel } from "./DTDChoiceModel";
import { DTDContentModel } from "./DTDContentModel";
import { DTDContentModelTokenizer, DTDToken } from "./DTDContentModelTokenizer";
import { DTDElementNameParticle } from "./DTDElementNameParticle";
import { DTDSequenceModel } from "./DTDSequenceModel";

export class DTDContentModelParser {

    private tokens: DTDToken[];
    private pos: number = 0;

    constructor(input: string) {
        const tokenizer: DTDContentModelTokenizer = new DTDContentModelTokenizer(input);
        this.tokens = tokenizer.tokenize();
    }

    private parseParticle(): DTDContentModel {
        // Parse a particle: group, mixed, or name
        const token: DTDToken | undefined = this.peek();
        if (!token) {
            throw new Error('Unexpected end of content model');
        }
        if (token.type === '(') {
            this.next(); // always consume '('
            const nextToken = this.peek();
            if (nextToken && nextToken.type === 'PCDATA') {
                return this.parseMixed();
            } else {
                return this.parseGroup();
            }
        } else if (token.type === 'NAME') {
            return this.parseNameParticle();
        } else {
            throw new Error('Expected (, or NAME in particle');
        }
    }

    parse(): DTDContentModel {
        if (this.tokens.length === 0) {
            throw new Error('Empty content model');
        }
        return this.parseParticle();
    }

    private parseGroup(): DTDContentModel {
        // Assumes '(' already consumed
        let particles: DTDContentModel[] = [];
        let separator: string | null = null;
        let expectParticle: boolean = true;
        let lastWasSeparator: boolean = false;
        while (true) {
            const token: DTDToken | undefined = this.peek();
            if (!token) {
                throw new Error('Unexpected end of content model');
            }
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
                if (!particle) {
                    throw new Error('Expected particle in group');
                }
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
        if (particles.length === 0) {
            throw new Error('Empty group not allowed');
        }
        if (lastWasSeparator) {
            throw new Error('Trailing separator in group');
        }
        if (!separator && particles.length > 1) {
            throw new Error('Missing separator in group');
        }
        let cardinality: string = this.parseCardinality();
        if (separator === '|') {
            const model: DTDChoiceModel = new DTDChoiceModel(particles);
            model.cardinality = cardinality;
            return model;
        } else if (separator === ',') {
            const model: DTDSequenceModel = new DTDSequenceModel(particles);
            model.cardinality = cardinality;
            return model;
        } else if (particles.length === 1) {
            if (cardinality && 'cardinality' in particles[0]) {
                (particles[0] as any).cardinality = cardinality;
            }
            return particles[0];
        } else {
            throw new Error('Invalid group structure');
        }
    }

    private parseMixed(): DTDChoiceModel {
        this.expect('PCDATA');
        let choice: DTDChoiceModel = new DTDChoiceModel();
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
        let cardinality: string = this.parseCardinality();
        // Accept (#PCDATA) and (#PCDATA|name|...)* as valid
        if (cardinality && cardinality !== '*') {
            throw new Error('Mixed content must end with )* or be (#PCDATA)');
        }
        choice.cardinality = cardinality;
        return choice;
    }

    private parseNameParticle(): DTDElementNameParticle {
        let name: string = this.expect('NAME').value;
        if (!XMLUtils.isValidXMLName(name)) {
            throw new Error('Invalid XML name in content model: ' + name);
        }
        let cardinality: string = this.parseCardinality();
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
        if (this.pos >= this.tokens.length) {
            return undefined;
        }
        return this.tokens[this.pos];
    }

    private expect(type: string): DTDToken {
        if (!this.match(type)) {
            throw new Error('Expected ' + type + ', got ' + (this.peek()?.type || 'EOF'));
        }
        // check bounds
        if (this.pos >= this.tokens.length) {
            throw new Error('Unexpected end of input');
        }
        return this.tokens[this.pos++];
    }

    private next(): DTDToken | undefined {
        if (this.pos >= this.tokens.length) {
            return undefined;
        }
        return this.tokens[this.pos++];
    }
}
