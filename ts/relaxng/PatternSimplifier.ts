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

import { RelaxNGPattern, RelaxNGPatternType } from './RelaxNGPattern';

export class PatternSimplifier {
    private static readonly MAX_SIMPLIFICATION_DEPTH = 100;

    static simplify(pattern: RelaxNGPattern): RelaxNGPattern {
        return this.simplifyWithDepth(pattern, 0);
    }

    private static simplifyWithDepth(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        if (depth > this.MAX_SIMPLIFICATION_DEPTH) {
            throw new Error('Pattern simplification exceeded maximum depth - possible infinite recursion');
        }

        switch (pattern.getType()) {
            case RelaxNGPatternType.CHOICE:
                return this.simplifyChoice(pattern, depth + 1);
            case RelaxNGPatternType.GROUP:
                return this.simplifyGroup(pattern, depth + 1);
            case RelaxNGPatternType.INTERLEAVE:
                return this.simplifyInterleave(pattern, depth + 1);
            case RelaxNGPatternType.ONE_OR_MORE:
                return this.simplifyOneOrMore(pattern, depth + 1);
            case RelaxNGPatternType.ZERO_OR_MORE:
                return this.simplifyZeroOrMore(pattern, depth + 1);
            case RelaxNGPatternType.OPTIONAL:
                return this.simplifyOptional(pattern, depth + 1);
            case RelaxNGPatternType.ELEMENT:
                return this.simplifyElement(pattern, depth + 1);
            case RelaxNGPatternType.ATTRIBUTE:
                return this.simplifyAttribute(pattern, depth + 1);
            case RelaxNGPatternType.LIST:
                return this.simplifyList(pattern, depth + 1);
            case RelaxNGPatternType.MIXED:
                return this.simplifyMixed(pattern, depth + 1);
            case RelaxNGPatternType.DATA:
                return this.simplifyData(pattern, depth + 1);
            default:
                return pattern.clone();
        }
    }

    private static simplifyChoice(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        const simplifiedChildren: RelaxNGPattern[] = [];

        for (const child of children) {
            const simplified = this.simplifyWithDepth(child, depth);
            
            if (simplified.getType() === RelaxNGPatternType.CHOICE) {
                simplifiedChildren.push(...simplified.getChildren());
            } else if (simplified.getType() !== RelaxNGPatternType.NOT_ALLOWED) {
                simplifiedChildren.push(simplified);
            }
        }

        const uniqueChildren = this.removeDuplicates(simplifiedChildren);

        if (uniqueChildren.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        } else if (uniqueChildren.length === 1) {
            return uniqueChildren[0];
        } else {
            const result = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
            for (const child of uniqueChildren) {
                result.addChild(child);
            }
            return result;
        }
    }

    private static simplifyGroup(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        const simplifiedChildren: RelaxNGPattern[] = [];

        for (const child of children) {
            const simplified = this.simplifyWithDepth(child, depth);
            
            if (simplified.getType() === RelaxNGPatternType.NOT_ALLOWED) {
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            }
            
            if (simplified.getType() === RelaxNGPatternType.GROUP) {
                simplifiedChildren.push(...simplified.getChildren());
            } else if (simplified.getType() !== RelaxNGPatternType.EMPTY) {
                simplifiedChildren.push(simplified);
            }
        }

        if (simplifiedChildren.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        } else if (simplifiedChildren.length === 1) {
            return simplifiedChildren[0];
        } else {
            const result = new RelaxNGPattern(RelaxNGPatternType.GROUP);
            for (const child of simplifiedChildren) {
                result.addChild(child);
            }
            return result;
        }
    }

    private static simplifyInterleave(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        const simplifiedChildren: RelaxNGPattern[] = [];

        for (const child of children) {
            const simplified = this.simplifyWithDepth(child, depth);
            
            if (simplified.getType() === RelaxNGPatternType.NOT_ALLOWED) {
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            }
            
            if (simplified.getType() === RelaxNGPatternType.INTERLEAVE) {
                simplifiedChildren.push(...simplified.getChildren());
            } else if (simplified.getType() !== RelaxNGPatternType.EMPTY) {
                simplifiedChildren.push(simplified);
            }
        }

        if (simplifiedChildren.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        } else if (simplifiedChildren.length === 1) {
            return simplifiedChildren[0];
        } else {
            const result = new RelaxNGPattern(RelaxNGPatternType.INTERLEAVE);
            for (const child of simplifiedChildren) {
                result.addChild(child);
            }
            return result;
        }
    }

    private static simplifyOneOrMore(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            throw new Error('oneOrMore pattern must have exactly one child');
        }

        const simplified = this.simplifyWithDepth(children[0], depth);
        
        if (simplified.getType() === RelaxNGPatternType.NOT_ALLOWED) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }
        
        if (simplified.getType() === RelaxNGPatternType.EMPTY) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        const result = new RelaxNGPattern(RelaxNGPatternType.ONE_OR_MORE);
        result.addChild(simplified);
        return result;
    }

    private static simplifyZeroOrMore(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            throw new Error('zeroOrMore pattern must have exactly one child');
        }

        const simplified = this.simplifyWithDepth(children[0], depth);
        
        if (simplified.getType() === RelaxNGPatternType.NOT_ALLOWED || 
            simplified.getType() === RelaxNGPatternType.EMPTY) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        // Transform to optional(oneOrMore(p))
        const oneOrMore = new RelaxNGPattern(RelaxNGPatternType.ONE_OR_MORE);
        oneOrMore.addChild(simplified);
        
        const optional = new RelaxNGPattern(RelaxNGPatternType.OPTIONAL);
        optional.addChild(oneOrMore);
        
        return this.simplifyOptional(optional, depth);
    }

    private static simplifyOptional(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            throw new Error('optional pattern must have exactly one child');
        }

        const simplified = this.simplifyWithDepth(children[0], depth);
        
        if (simplified.getType() === RelaxNGPatternType.NOT_ALLOWED) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }
        
        if (simplified.getType() === RelaxNGPatternType.EMPTY) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        // Transform to choice(empty, p)
        const choice = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
        choice.addChild(new RelaxNGPattern(RelaxNGPatternType.EMPTY));
        choice.addChild(simplified);
        
        return this.simplifyChoice(choice, depth);
    }

    private static simplifyElement(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const result = pattern.clone();
        result.clearChildren();
        
        for (const child of pattern.getChildren()) {
            const simplified = this.simplifyWithDepth(child, depth);
            result.addChild(simplified);
        }
        
        return result;
    }

    private static simplifyAttribute(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const result = pattern.clone();
        result.clearChildren();
        
        for (const child of pattern.getChildren()) {
            const simplified = this.simplifyWithDepth(child, depth);
            result.addChild(simplified);
        }
        
        return result;
    }

    private static simplifyList(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            throw new Error('list pattern must have exactly one child');
        }

        const simplified = this.simplifyWithDepth(children[0], depth);
        
        if (simplified.getType() === RelaxNGPatternType.NOT_ALLOWED) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        const result = new RelaxNGPattern(RelaxNGPatternType.LIST);
        result.addChild(simplified);
        return result;
    }

    private static simplifyMixed(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            throw new Error('mixed pattern must have exactly one child');
        }

        const simplified = this.simplifyWithDepth(children[0], depth);
        
        // Transform to interleave(text, p)
        const interleave = new RelaxNGPattern(RelaxNGPatternType.INTERLEAVE);
        interleave.addChild(new RelaxNGPattern(RelaxNGPatternType.TEXT));
        interleave.addChild(simplified);
        
        return this.simplifyInterleave(interleave, depth);
    }

    private static simplifyData(pattern: RelaxNGPattern, depth: number): RelaxNGPattern {
        const result = pattern.clone();
        result.clearChildren();
        
        for (const child of pattern.getChildren()) {
            const simplified = this.simplifyWithDepth(child, depth);
            result.addChild(simplified);
        }
        
        return result;
    }

    private static removeDuplicates(patterns: RelaxNGPattern[]): RelaxNGPattern[] {
        const unique: RelaxNGPattern[] = [];
        
        for (const pattern of patterns) {
            let isDuplicate = false;
            for (const existing of unique) {
                if (this.areStructurallyEqual(pattern, existing)) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                unique.push(pattern);
            }
        }
        
        return unique;
    }

    private static areStructurallyEqual(pattern1: RelaxNGPattern, pattern2: RelaxNGPattern): boolean {
        if (pattern1.getType() !== pattern2.getType()) {
            return false;
        }
        
        if (pattern1.getName() !== pattern2.getName() ||
            pattern1.getNamespace() !== pattern2.getNamespace() ||
            pattern1.getDataType() !== pattern2.getDataType() ||
            pattern1.getDatatypeLibrary() !== pattern2.getDatatypeLibrary() ||
            pattern1.getValue() !== pattern2.getValue() ||
            pattern1.getRefName() !== pattern2.getRefName() ||
            pattern1.getNs() !== pattern2.getNs() ||
            pattern1.getTextContent() !== pattern2.getTextContent()) {
            return false;
        }
        
        const children1 = pattern1.getChildren();
        const children2 = pattern2.getChildren();
        
        if (children1.length !== children2.length) {
            return false;
        }
        
        for (let i = 0; i < children1.length; i++) {
            if (!this.areStructurallyEqual(children1[i], children2[i])) {
                return false;
            }
        }
        
        return true;
    }
}