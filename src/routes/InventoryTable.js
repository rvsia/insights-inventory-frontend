import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import './inventory.scss';
import routerParams from '@redhat-cloud-services/frontend-components-utilities/files/RouterParams';
import { PageHeader, PageHeaderTitle, Main } from '@redhat-cloud-services/frontend-components';
import { entitiesReducer } from '../store';
import * as actions from '../actions';
import { Grid, GridItem } from '@patternfly/react-core';
import { asyncInventoryLoader } from '../components/inventory/AsyncInventory';
import { getRegistry } from '@redhat-cloud-services/frontend-components-utilities/files/Registry';
import { addNotification } from '@redhat-cloud-services/frontend-components-notifications/cjs/actions';
import { useStore } from 'react-redux';
import DeleteModal from '../components/DeleteModal';
import TextInputModal from '@redhat-cloud-services/frontend-components-inventory-general-info/TextInputModal';
import flatMap from 'lodash/flatMap';

const calculateChecked = (rows = [], selected) => (
    rows.every(({ id }) => selected && selected.has(id))
        ? rows.length > 0
        : rows.some(({ id }) => selected && selected.has(id)) && null
);

const mapTags = ({ category, values }) => values.map(({ key, value }) => `${
    category ? `${category}/` : ''
}${
    key
}${
    value ? `=${value}` : ''
}`);

const filterMapper = {
    staleFilter: ({ staleFilter }, searchParams) => staleFilter.forEach(item => searchParams.append('status', item)),
    registeredWithFilter: ({ registeredWithFilter }, searchParams) => registeredWithFilter
    ?.forEach(item => searchParams.append('source', item)),
    value: ({ value, filter }, searchParams) => value === 'hostname_or_id' &&
    Boolean(filter) &&
    searchParams.append('hostname_or_id', filter),
    tagFilters: ({ tagFilters }, searchParams) => tagFilters?.length > 0 && searchParams.append(
        'tags',
        flatMap(tagFilters, mapTags)
    )
};

const calculateFilters = (searchParams, filters = []) => {
    filters.forEach((filter) => {
        Object.keys(filter).forEach(key => {
            filterMapper?.[key]?.(filter, searchParams);
        });
    });

    return searchParams;
};

const calculatePagination = (searchParams, page, perPage) => {
    searchParams.append('page', page);
    searchParams.append('per_page', perPage);
};

const Inventory = ({
    clearNotifications,
    deleteEntity,
    addNotification,
    loaded,
    rows,
    updateDisplayName,
    onSelectRows,
    selected,
    status,
    setFilter,
    history,
    source,
    filterbyName,
    tagsFilter,
    page,
    perPage,
    setPagination
}) => {
    const inventory = useRef(null);
    const [ConnectedInventory, setInventory] = useState();
    const [isModalOpen, handleModalToggle] = useState(false);
    const [currentSytem, activateSystem] = useState({});
    const [filters, onSetfilters] = useState([]);
    const [ediOpen, onEditOpen] = useState(false);
    const [globalFilter, setGlobalFilter] = useState();
    const store = useStore();
    const loadInventory = async () => {
        clearNotifications();
        const {
            inventoryConnector,
            mergeWithEntities,
            INVENTORY_ACTION_TYPES
        } = await asyncInventoryLoader();
        getRegistry().register({
            ...mergeWithEntities(entitiesReducer(INVENTORY_ACTION_TYPES))
        });

        setFilter([
            status && status.length > 0 && {
                staleFilter: Array.isArray(status) ? status : [status]
            },
            tagsFilter && tagsFilter.length > 0 && {
                tagFilters: Array.isArray(tagsFilter) ? tagsFilter : [tagsFilter]
            },
            source && source.length > 0 && {
                source: Array.isArray(source) ? source : [source]
            },
            filterbyName && filterbyName.length > 0 && {
                value: 'hostname_or_id',
                filter: Array.isArray(filterbyName) ? filterbyName[0] : filterbyName
            }
        ]);

        if (perPage || page) {
            setPagination(
                Array.isArray(page) ? page[0] : page,
                Array.isArray(perPage) ? perPage[0] : perPage
            );
        }

        const { InventoryTable } = inventoryConnector(store);
        setInventory(() => InventoryTable);
    };

    const onRefresh = (options, callback) => {
        onSetfilters(options?.filters);
        const searchParams = new URLSearchParams();
        calculateFilters(searchParams, options?.filters);
        // eslint-disable-next-line camelcase
        calculatePagination(searchParams, options?.page, options?.per_page);
        const search = searchParams.toString();
        history.push({
            search
        });

        if (!callback && inventory && inventory.current) {
            inventory.current.onRefreshData(options);
        } else if (callback) {
            callback(options);
        }
    };

    useEffect(() => {
        insights.chrome?.hideGlobalFilter?.(false);
        insights.chrome.appAction('system-list');
        insights.chrome.appObjectId();
        insights.chrome.on('GLOBAL_FILTER_UPDATE', ({ data }) => {
            setGlobalFilter(insights.chrome?.mapGlobalFilter?.(data).filter(item => !item.includes('workloads')) || undefined);
            if (inventory.current) {
                inventory.current.onRefreshData({});
            }
        });
        loadInventory();
    }, []);

    const calculateSelected = () => selected ? selected.size : 0;

    return (
        <React.Fragment>
            <PageHeader className="pf-m-light">
                <PageHeaderTitle title='Inventory'/>
            </PageHeader>
            <Main>
                <Grid gutter="md">
                    <GridItem span={12}>
                        {
                            ConnectedInventory &&
                                <ConnectedInventory
                                    customFilters={{
                                        tags: globalFilter
                                    }}
                                    isFullView
                                    store={store}
                                    ref={inventory}
                                    hasCheckbox
                                    showTags
                                    onRefresh={onRefresh}
                                    actions={ [
                                        {
                                            title: 'Delete',
                                            onClick: (_event, _index, { id: systemId, display_name: displayName }) => {
                                                activateSystem(() => ({
                                                    id: systemId,
                                                    displayName
                                                }));
                                                handleModalToggle(() => true);
                                            }
                                        }, {
                                            title: 'Edit',
                                            onClick: (_event, _index, data) => {
                                                activateSystem(() => data);
                                                onEditOpen(() => true);
                                            }
                                        }
                                    ]}
                                    actionsConfig={{
                                        actions: [{
                                            label: 'Delete',
                                            props: {
                                                isDisabled: calculateSelected() === 0,
                                                variant: 'secondary',
                                                onClick: () => {
                                                    activateSystem(Array.from(selected.values()));
                                                    handleModalToggle(true);
                                                }
                                            }
                                        }]
                                    }}
                                    bulkSelect={{
                                        count: calculateSelected(),
                                        items: [{
                                            title: 'Select none (0)',
                                            onClick: () => {
                                                onSelectRows(-1, false);
                                            }
                                        },
                                        {
                                            ...loaded && rows && rows.length > 0 ? {
                                                title: `Select page (${ rows.length })`,
                                                onClick: () => {
                                                    onSelectRows(0, true);
                                                }
                                            } : {}
                                        }],
                                        checked: calculateChecked(rows, selected),
                                        onSelect: (value) => {
                                            onSelectRows(0, value);
                                        }
                                    }}
                                    tableProps={{
                                        canSelectAll: false
                                    }}
                                    onRowClick={(_e, id, app) => history.push(`/${id}${app ? `/${app}` : ''}`)}
                                />
                        }
                    </GridItem>
                </Grid>
            </Main>
            <DeleteModal
                handleModalToggle={handleModalToggle}
                isModalOpen={isModalOpen}
                currentSytem={currentSytem}
                onConfirm={() => {
                    let displayName;
                    let removeSystems;
                    if (Array.isArray(currentSytem)) {
                        removeSystems = currentSytem.map(({ id }) => id);
                        displayName = currentSytem.length > 1 ?
                            `${currentSytem.length} systems` :
                            currentSytem[0].display_name;
                    } else {
                        displayName = currentSytem.displayName;
                        removeSystems = [currentSytem.id];
                    }

                    addNotification({
                        id: 'remove-initiated',
                        variant: 'warning',
                        title: 'Delete operation initiated',
                        description: `Removal of ${displayName} started.`,
                        dismissable: false
                    });
                    deleteEntity(removeSystems, displayName, () => onRefresh({ filters }));
                    handleModalToggle(false);
                }}
            />

            <TextInputModal
                title="Edit display name"
                isOpen={ediOpen}
                value={currentSytem.display_name}
                onCancel={() => onEditOpen(false)}
                onSubmit={(value) => {
                    updateDisplayName(currentSytem.id, value, inventory.current.onRefreshData);
                    onEditOpen(false);
                }}
            />
        </React.Fragment>
    );
};

Inventory.contextTypes = {
    store: PropTypes.object
};

Inventory.propTypes = {
    rows: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        selected: PropTypes.bool
    })),
    loaded: PropTypes.bool,
    loadEntity: PropTypes.func,
    clearNotifications: PropTypes.func,
    deleteEntity: PropTypes.func,
    addNotification: PropTypes.func,
    updateDisplayName: PropTypes.func,
    onSelectRows: PropTypes.func,
    setFilter: PropTypes.func,
    selected: PropTypes.map,
    status: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.string), PropTypes.string]),
    source: PropTypes.oneOfType([PropTypes.arrayOf(PropTypes.string), PropTypes.string]),
    filterbyName: PropTypes.string,
    tagsFilter: PropTypes.any,
    history: PropTypes.shape({
        push: PropTypes.func
    }),
    page: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    perPage: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    setPagination: PropTypes.func
};

function mapDispatchToProps(dispatch) {
    const reloadWrapper = (event, callback) => {
        event.payload.then(callback);
        return event;
    };

    return {
        loadEntity: (id) => dispatch(actions.loadEntity(id)),
        clearNotifications: () => dispatch(actions.clearNotifications()),
        deleteEntity: (id, hostName, callback) => dispatch(reloadWrapper(actions.deleteEntity(id, hostName), callback)),
        addNotification: (payload) => dispatch(addNotification(payload)),
        updateDisplayName: (id, displayName, callback) => dispatch(
            reloadWrapper(actions.editDisplayName(id, displayName), callback)
        ),
        onSelectRows: (id, isSelected) => dispatch(actions.selectEntity(id, isSelected)),
        setFilter: (filtersList) => {
            const filters = filtersList.filter(Boolean);
            if (filters?.length > 0) {
                dispatch(actions.setFilter(filters));
            }
        },
        setPagination: (page, perPage) => dispatch(actions.setPagination(page, perPage))
    };
}

export default routerParams(connect(({ entities }) => ({
    rows: entities && entities.rows,
    loaded: entities && entities.loaded,
    selected: entities && entities.selected
}), mapDispatchToProps)(Inventory));
