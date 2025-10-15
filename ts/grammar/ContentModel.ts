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

import { ContentParticle } from "./contentParticle";
import { DTDChoice } from "./dtdChoice";
import { DTDName } from "./dtdName";
import { DTDPCData } from "./dtdPCData";
import { DTDSecuence } from "./dtdSecuence";

export const Cardinality = {
    NONE: 0, // (exactly one)
    OPTIONAL: 1, // ?
    ZEROMANY: 2, // *
    ONEMANY: 3,  // +
} as const;

export const ContentModelType = {
    EMPTY: 'EMPTY',
    ANY: 'ANY',
    MIXED: 'Mixed',
    PCDATA: '#PCDATA',
    CHILDREN: 'Children'
} as const;

export class ContentModel {

    private content: Array<ContentParticle>;
    private type: typeof ContentModelType[keyof typeof ContentModelType] = ContentModelType.EMPTY;

    constructor(content: Array<ContentParticle>, type: typeof ContentModelType[keyof typeof ContentModelType]) {
        this.content = content;
        this.type = type;
    }

    static parse(modelString: string): ContentModel {
        const model = new ContentModel([], ContentModelType.EMPTY);
        return model.parseSpec(modelString);
    }

    getContent(): Array<ContentParticle> {
        return this.content;
    }

    getType(): typeof ContentModelType[keyof typeof ContentModelType] {
        return this.type;
    }

    validateParentheses(contentString: string) {
        let balance = 0;
        for (let c of contentString) {
            if (c == '(')
                balance++;
            else if (c == ')')
                balance--;
            if (balance < 0) {
                throw new Error('Unbalanced parentheses in content model: ' + contentString);
            }
        }
        if (balance != 0) {
            throw new Error('Unbalanced parentheses in content model: ' + contentString);
        }
    }

    parseSpec(modelString: string): ContentModel {
        let contentString: string = modelString.replaceAll("\\s+", "");
        try {
            this.validateParentheses(contentString);
        } catch (e: unknown) {
            throw e;
        }
        let particles: Array<ContentParticle> = new Array<ContentParticle>();
        let type: typeof ContentModelType[keyof typeof ContentModelType] = ContentModelType.CHILDREN;

        // Handle EMPTY and ANY
        if (contentString === ContentModelType.EMPTY) {
            type = ContentModelType.EMPTY;
            return new ContentModel(particles, type);
        }
        if (contentString === ContentModelType.ANY) {
            type = ContentModelType.ANY;
            return new ContentModel(particles, type);
        }

        // Handle pure PCDATA
        if (contentString === "(#PCDATA)") {
            particles.push(new DTDPCData());
            return new ContentModel(particles, ContentModelType.MIXED);
        }

        // Handle mixed content
        if (contentString.startsWith("(#PCDATA")) {
            type = ContentModelType.MIXED;
            if (!contentString.endsWith(")*")) {
                throw new Error('Invalid mixed content model: ' + modelString);
            }
        }

        // Handle element content (sequence/choice/groups)
        const tokens: string[] = [];
        let buffer = '';
        for (let i = 0; i < contentString.length; i++) {
            const c = contentString[i];
            if ('()|,?*+'.includes(c)) {
                if (buffer.trim().length > 0) {
                    tokens.push(buffer.trim());
                    buffer = '';
                }
                tokens.push(c);
            } else {
                buffer += c;
            }
        }
        if (buffer.trim().length > 0) {
            tokens.push(buffer.trim());
        }
        const stack: Array<Array<any>> = [];
        let current: Array<any> = [];

        for (let token of tokens) {
            if (token === "(") {
                stack.push(current);
                current = [];
            } else if (token === ")") {
                const groupParticle = this.processGroup(current);
                current = stack.pop() as Array<any>;
                current.push(groupParticle);
            } else if (token === "*" || token === "+" || token === "?") {
                if (current.length === 0) {
                    throw new Error('Cardinality operator "' + token + '" must follow a valid particle');
                }
                const lastObject = current[current.length - 1];
                if (!(this.isContentParticle(lastObject))) {
                    throw new Error('Cardinality operator "' + token + '" must follow a valid particle');
                }
                const cardinality = token === "?" ? Cardinality.OPTIONAL : (token === "*" ? Cardinality.ZEROMANY : Cardinality.ONEMANY);
                (lastObject as ContentParticle).setCardinality(cardinality);
            } else if (token === "|" || token === ",") {
                current.push(token);
            } else if (token === ContentModelType.PCDATA) {
                current.push(new DTDPCData());
            } else {
                current.push(new DTDName(token));
            }
        }

        for (const obj of current) {
            if (!this.isContentParticle(obj)) {
                throw new Error('Invalid object in content model: ' + obj);
            }
            particles.push(obj);
        }

        return new ContentModel(particles, type);
    }

    isContentParticle(obj: any): boolean {
        return obj instanceof DTDName || obj instanceof DTDChoice || obj instanceof DTDSecuence || obj instanceof DTDPCData;
    }

    processGroup(group: Array<any>): ContentParticle {
        if (group.length === 0) {
            throw new Error('Empty group found in content model')
        }
        if (group.length === 1) {
            let obj: any = group[0];
            if (typeof obj === "string") {
                return new DTDName(obj);
            }
            if (obj instanceof DTDChoice) {
                return obj as DTDChoice;
            }
            if (obj instanceof DTDSecuence) {
                return obj as DTDSecuence;
            }
            if (obj instanceof DTDName) {
                return obj as DTDName;
            }
            if (obj instanceof DTDPCData) {
                return obj as DTDPCData;
            }
            throw new Error('Invalid object in content model group: ' + obj);
        }
        let sep: String | null = null;
        for (let obj of group) {
            if (typeof obj === "string") {
                if (obj === "|" || obj === ",") {
                    sep = obj;
                    break;
                }
            }
        }
        if (sep === null) {
            throw new Error('No separator found when parsing group');
        }
        let result: ContentParticle = sep === "|" ? new DTDChoice() : new DTDSecuence();
        for (let obj of group) {
            if (obj === "|" || obj === ",") {
                continue;
            }
            if (typeof obj === "string") {
                result.addParticle(new DTDName(obj));
            } else if (obj instanceof DTDChoice) {
                result.addParticle(obj);
            } else if (obj instanceof DTDSecuence) {
                result.addParticle(obj);
            } else if (obj instanceof DTDName) {
                result.addParticle(obj);
            } else if (obj instanceof DTDPCData) {
                result.addParticle(obj);
            } else {
                throw new Error('Invalid object in content model group: ' + obj);
            }
        }
        return result;
    }

    toString(): string {
        if (this.type === ContentModelType.EMPTY) {
            return ContentModelType.EMPTY;
        }
        if (this.type === ContentModelType.ANY) {
            return ContentModelType.ANY;
        }
        if (this.content.length === 0) {
            return "";
        }

        let sb: string = '';

        // For MIXED content, handle specially
        if (this.type === ContentModelType.MIXED) {
            sb += "(";
            for (let i = 0; i < this.content.length; i++) {
                let particle = this.content[i];
                sb += particle.toString();
                if (i < this.content.length - 1) {
                    sb += "|";
                }
            }
            sb += ")*";
            return sb;
        }

        // For CHILDREN content, the particles themselves determine the structure
        for (let i = 0; i < this.content.length; i++) {
            let particle = this.content[i];
            sb += particle.toString();
            if (i < this.content.length - 1) {
                // This should not happen as CHILDREN content typically has a single root particle
                sb += ","; // Default to sequence if multiple top-level particles
            }
        }
        return sb;
    }

    isMixed(): boolean {
        return this.type === ContentModelType.MIXED;
    }

    getChildren(): Set<string> {
        if (this.type === ContentModelType.EMPTY) {
            return new Set<string>();
        }
        const children = new Set<string>();
        for (const particle of this.content) {
            if (particle instanceof DTDName) {
                children.add(particle.getName());
            }
            if (particle instanceof DTDChoice) {
                const choice = particle as DTDChoice;
                for (const child of choice.getChildren()) {
                    children.add(child);
                }
            }
            if (particle instanceof DTDSecuence) {
                const sequence = particle as DTDSecuence;
                for (const child of sequence.getChildren()) {
                    children.add(child);
                }
            }
        }
        return children;
    }
}
