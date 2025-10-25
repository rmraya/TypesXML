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

import { ValidationResult } from '../grammar/Grammar';
import { ContentModel } from './ContentModel';
import { ValidationParticle } from './ValidationParticle';
import { SequenceParticle } from './SequenceParticle';
import { ChoiceParticle } from './ChoiceParticle';
import { ValidationContext } from './Model';

export class GroupModel extends ContentModel {
    private name: string;
    private contentModel?: ContentModel;
    
    constructor(name: string, minOccurs?: number, maxOccurs?: number) {
        super(minOccurs, maxOccurs);
        this.name = name;
    }
    
    getName(): string {
        return this.name;
    }
    
    setContentModel(contentModel: ContentModel): void {
        this.contentModel = contentModel;
    }
    
    getContentModel(): ContentModel | undefined {
        return this.contentModel;
    }
    
    getType(): string {
        return 'group';
    }
    
    toParticle(context?: ValidationContext): ValidationParticle {
        if (!this.contentModel) {
            // Empty group - create a sequence particle that accepts nothing
            const particle = new SequenceParticle();
            particle.setCardinality(this.minOccurs, this.maxOccurs);
            return particle;
        }
        
        // Delegate to the wrapped content model
        const innerParticle = this.contentModel.toParticle(context);
        
        // If the group has different occurrence constraints, wrap it
        if (this.minOccurs !== 1 || this.maxOccurs !== 1) {
            if (this.contentModel.getType() === 'sequence') {
                const wrapper = new SequenceParticle();
                wrapper.setCardinality(this.minOccurs, this.maxOccurs);
                wrapper.addComponent(innerParticle);
                return wrapper;
            } else if (this.contentModel.getType() === 'choice') {
                const wrapper = new ChoiceParticle();
                wrapper.setCardinality(this.minOccurs, this.maxOccurs);
                wrapper.addComponent(innerParticle);
                return wrapper;
            }
        }
        
        return innerParticle;
    }
    
    validate(children: string[], context?: ValidationContext): ValidationResult {
        if (!this.contentModel) {
            // Empty group - only valid if no children
            if (children.length === 0) {
                return ValidationResult.success();
            } else {
                return ValidationResult.error(`Group ${this.name} is empty but found ${children.length} child elements`);
            }
        }
        
        // Delegate validation to the wrapped content model
        return this.contentModel.validate(children, context);
    }
    
    canAccept(element: string, position: number, children: string[]): boolean {
        if (!this.contentModel) {
            return false;
        }
        return this.contentModel.canAccept(element, position, children);
    }
    
    getPossibleElements(position: number, children: string[]): string[] {
        if (!this.contentModel) {
            return [];
        }
        return this.contentModel.getPossibleElements(position, children);
    }
}