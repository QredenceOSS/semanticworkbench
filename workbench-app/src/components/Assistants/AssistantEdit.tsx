// Copyright (c) Microsoft. All rights reserved.

import { Button, Card, Divider, makeStyles, shorthands, Text, tokens } from '@fluentui/react-components';
import Form from '@rjsf/fluentui-rc';
import { RegistryWidgetsType, RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import debug from 'debug';
import React from 'react';
import { Constants } from '../../Constants';
import { Utility } from '../../libs/Utility';
import { Assistant } from '../../models/Assistant';
import { useGetConfigQuery, useUpdateConfigMutation } from '../../services/workbench';
import { ConfirmLeave } from '../App/ConfirmLeave';
import { CustomizedArrayFieldTemplate } from '../App/FormWidgets/CustomizedArrayFieldTemplate';
import { CustomizedObjectFieldTemplate } from '../App/FormWidgets/CustomizedObjectFieldTemplate';
import { InspectableWidget } from '../App/FormWidgets/InspectableWidget';
import { Loading } from '../App/Loading';
import { ApplyConfigButton } from './ApplyConfigButton';

const log = debug(Constants.debug.root).extend('AssistantEdit');

const useClasses = makeStyles({
    card: {
        backgroundImage: `linear-gradient(to right, ${tokens.colorNeutralBackground1}, ${tokens.colorBrandBackground2})`,
    },
    actions: {
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
        zIndex: tokens.zIndexContent,
        backgroundColor: 'white',
        padding: '8px',
        ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke1),
    },
});

interface AssistantInstanceEditProps {
    assistant: Assistant;
}

export const AssistantEdit: React.FC<AssistantInstanceEditProps> = (props) => {
    const { assistant } = props;
    const classes = useClasses();
    const {
        data: config,
        error: configError,
        isLoading: isLoadingConfig,
    } = useGetConfigQuery({ assistantId: assistant.id });
    const [updateConfig] = useUpdateConfigMutation();
    const [formData, setFormData] = React.useState<object>();
    const [isDirty, setDirty] = React.useState(false);

    if (configError) {
        const errorMessage = JSON.stringify(configError);
        throw new Error(`Error loading assistant config: ${errorMessage}`);
    }

    React.useEffect(() => {
        if (isLoadingConfig) return;
        setFormData(config?.config);
    }, [isLoadingConfig, config]);

    const handleChange = async (updatedConfig: object) => {
        if (!config) return;
        setFormData(updatedConfig);
        await updateConfig({ assistantId: assistant.id, config: { ...config, config: updatedConfig } });
        setDirty(false);
    };

    const defaults = React.useMemo(() => {
        if (config?.jsonSchema) {
            return extractDefaultsFromSchema(config.jsonSchema);
        }
        return {};
    }, [config]);

    React.useEffect(() => {
        if (config?.config && formData) {
            // Compare the current form data with the original config to determine if the form is dirty
            const diff = Utility.deepDiff(config.config, formData);
            setDirty(Object.keys(diff).length > 0);
        }
    }, [config, formData]);

    if (isLoadingConfig || !config) {
        return <Loading />;
    }

    const restoreConfig = (config: object) => {
        log('Restoring config', config);
        setFormData(config);
    };

    const widgets: RegistryWidgetsType = {
        inspectable: InspectableWidget,
    };

    const templates = {
        ArrayFieldTemplate: CustomizedArrayFieldTemplate,
        ObjectFieldTemplate: CustomizedObjectFieldTemplate,
    };

    return (
        <Card className={classes.card}>
            <Text size={400} weight="semibold">
                Assistant Configuration
            </Text>
            <Text size={300} italic color="neutralSecondary">
                Please practice Responsible AI when configuring your assistant. See the{' '}
                <a
                    href="https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/system-message"
                    target="_blank"
                    rel="noreferrer"
                >
                    Microsoft Azure OpenAI Service: System message templates
                </a>{' '}
                page for suggestions regarding content for the prompts below.
            </Text>
            <Divider />
            <ConfirmLeave isDirty={isDirty} />
            <div className={classes.actions}>
                <Button appearance="primary" onClick={() => handleChange(formData ?? {})} disabled={!isDirty}>
                    Save
                </Button>
                <ApplyConfigButton
                    label="Reset"
                    confirmMessage="Are you sure you want to reset the changes to configuration?"
                    currentConfig={formData}
                    newConfig={config.config}
                    onApply={restoreConfig}
                />
                <ApplyConfigButton
                    label="Load defaults"
                    confirmMessage="Are you sure you want to load the default configuration?"
                    currentConfig={formData}
                    newConfig={defaults}
                    onApply={restoreConfig}
                />
            </div>
            <Form
                aria-autocomplete="none"
                autoComplete="off"
                widgets={widgets}
                templates={templates}
                schema={config.jsonSchema ?? {}}
                uiSchema={{
                    'ui:title': 'Update the assistant configuration',
                    ...config.uiSchema,
                    'ui:submitButtonOptions': {
                        norender: true,
                        submitText: 'Save',
                        props: {
                            disabled: isDirty === false,
                        },
                    },
                }}
                validator={validator}
                formData={formData}
                onChange={(data) => {
                    setFormData(data.formData);
                }}
                onSubmit={(data, event) => {
                    event.preventDefault();
                    handleChange(data.formData);
                }}
            />
        </Card>
    );
};

/*
 * Helpers
 */

function extractDefaultsFromSchema(schema: RJSFSchema): any {
    const defaults: any = {};

    function traverse(schema: any, path: string[] = [], rootSchema: any = schema) {
        if (schema.default !== undefined) {
            setDefault(defaults, path, schema.default);
        }

        if (schema.properties) {
            for (const key in schema.properties) {
                traverse(schema.properties[key], [...path, key], rootSchema);
            }
        }

        if (schema.$ref) {
            const refPath = schema.$ref.replace(/^#\/\$defs\//, '').split('/');
            const refSchema = refPath.reduce((acc: any, key: string) => acc?.[key], rootSchema.$defs);
            if (refSchema) {
                traverse(refSchema, path, rootSchema);
            } else {
                console.error(`Reference not found: ${schema.$ref}`);
            }
        }
    }

    function setDefault(obj: any, path: string[], value: any) {
        let current = obj;
        for (let i = 0; i < path.length - 1; i++) {
            if (!current[path[i]]) {
                current[path[i]] = {};
            } else {
                // Create a new object to avoid modifying read-only properties
                current[path[i]] = { ...current[path[i]] };
            }
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
    }

    traverse(schema);
    return defaults;
}