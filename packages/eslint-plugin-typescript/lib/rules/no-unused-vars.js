/**
 * @fileoverview Prevent TypeScript-specific variables being falsely marked as unused
 * @author James Henry
 */
"use strict";

/**
 * Record that a particular variable has been used in code
 *
 * @param {Object} context The current rule context.
 * @param {string} name The name of the variable to mark as used.
 * @returns {boolean} True if the variable was found and marked as used, false if not.
 */
function markVariableAsUsed(context, name) {
    let scope = context.getScope();
    let variables;
    let i;
    let len;
    let found = false;

    // Special Node.js scope means we need to start one level deeper
    if (scope.type === "global") {
        while (scope.childScopes.length) {
            scope = scope.childScopes[0];
        }
    }

    do {
        variables = scope.variables;
        for (i = 0, len = variables.length; i < len; i++) {
            if (variables[i].name === name) {
                variables[i].eslintUsed = true;
                found = true;
            }
        }
        scope = scope.upper;
    } while (scope);

    return found;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description:
                "Prevent TypeScript-specific variables being falsely marked as unused.",
            category: "TypeScript",
            recommended: true
        },
        schema: []
    },

    create(context) {
        //----------------------------------------------------------------------
        // Helpers
        //----------------------------------------------------------------------

        /**
         * Checks if the given node has any decorators and marks them as used.
         * @param {ASTNode} node The relevant AST node.
         * @returns {void}
         * @private
         */
        function markDecoratorsAsUsed(node) {
            if (!node.decorators || !node.decorators.length) {
                return;
            }
            node.decorators.forEach(decorator => {
                /**
                 * Decorator
                 */
                if (decorator.name) {
                    markVariableAsUsed(context, decorator.name);
                    return;
                }

                if (decorator.expression && decorator.expression.name) {
                    markVariableAsUsed(context, decorator.expression.name);
                    return;
                }

                /**
                 * Decorator Factory
                 */
                if (decorator.callee && decorator.callee.name) {
                    markVariableAsUsed(context, decorator.callee.name);
                }

                if (
                    decorator.expression &&
                    decorator.expression.callee &&
                    decorator.expression.callee.name
                ) {
                    markVariableAsUsed(
                        context,
                        decorator.expression.callee.name
                    );
                }
            });
        }

        /**
         * Checks if the given node has any implemented interfaces and marks them as used.
         * @param {ASTNode} node The relevant AST node.
         * @returns {void}
         * @private
         */
        function markImplementedInterfacesAsUsed(node) {
            if (!node.implements || !node.implements.length) {
                return;
            }
            node.implements.forEach(implementedInterface => {
                if (
                    !implementedInterface ||
                    !implementedInterface.id ||
                    !implementedInterface.id.name
                ) {
                    return;
                }
                markVariableAsUsed(context, implementedInterface.id.name);
            });
        }

        /**
         * Checks if the given node has a type annotation and marks it as used.
         * @param {ASTNode} node the relevant AST node.
         * @returns {void}
         * @private
         */
        function markTypeAnnotationAsUsed(node) {
            const annotation = node.typeAnnotation || node;

            switch (annotation.type) {
                case "TSTypeReference": {
                    if (annotation.typeName.type === "TSArrayType") {
                        markTypeAnnotationAsUsed(
                            annotation.typeName.elementType
                        );
                    } else {
                        markVariableAsUsed(context, annotation.typeName.name);
                        if (
                            annotation.typeParameters &&
                            annotation.typeParameters.params
                        ) {
                            annotation.typeParameters.params.forEach(param => {
                                markTypeAnnotationAsUsed(param);
                            });
                        }
                    }

                    break;
                }
                case "TSUnionType":
                case "TSIntersectionType":
                    annotation.types.forEach(type => {
                        markTypeAnnotationAsUsed(type);
                    });

                    break;

                default:
                    break;
            }
        }

        /**
         * Checks if the given node has a return type and marks it as used.
         * @param {ASTNode} node the relevant AST node.
         * @returns {void}
         * @private
         */
        function markFunctionReturnTypeAsUsed(node) {
            if (node.returnType) {
                markTypeAnnotationAsUsed(node.returnType);
            }
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------
        return {
            Identifier(node) {
                if (node.typeAnnotation) {
                    markTypeAnnotationAsUsed(node.typeAnnotation);
                }
            },

            TypeAnnotation(node) {
                if (node.typeAnnotation) {
                    markTypeAnnotationAsUsed(node.typeAnnotation);
                }
            },

            FunctionDeclaration: markFunctionReturnTypeAsUsed,
            FunctionExpression: markFunctionReturnTypeAsUsed,
            ArrowFunctionExpression: markFunctionReturnTypeAsUsed,

            ClassProperty: markDecoratorsAsUsed,
            ClassDeclaration(node) {
                markDecoratorsAsUsed(node);
                markImplementedInterfacesAsUsed(node);
            },
            MethodDefinition(node) {
                /**
                 * Decorators are only supported on class methods, so exit early
                 * if the parent is not a ClassBody
                 */
                const anc = context.getAncestors();
                const tAnc = anc.length;

                if (
                    !tAnc ||
                    !anc[tAnc - 1] ||
                    anc[tAnc - 1].type !== "ClassBody"
                ) {
                    return;
                }

                /**
                 * Mark any of the method's own decorators as used
                 */
                markDecoratorsAsUsed(node);

                /**
                 * Mark any parameter decorators as used
                 */
                if (
                    !node.value ||
                    !node.value.params ||
                    !node.value.params.length
                ) {
                    return;
                }
                node.value.params.forEach(markDecoratorsAsUsed);
            }
        };
    }
};