import Graphic from "@arcgis/core/Graphic";
import Map from "@arcgis/core/Map";
import PopupTemplate from "@arcgis/core/PopupTemplate";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import Point from "@arcgis/core/geometry/Point";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import OrientedImageryLayer from "@arcgis/core/layers/OrientedImageryLayer";
import CustomContent from "@arcgis/core/popup/content/CustomContent";
import MapView from "@arcgis/core/views/MapView";
import Editor from "@arcgis/core/widgets/Editor";
import Expand from "@arcgis/core/widgets/Expand";
import LayerList from "@arcgis/core/widgets/LayerList";
import OrientedImageryViewer from "@arcgis/core/widgets/OrientedImageryViewer";
import { defineCustomElements } from "@esri/calcite-components/dist/loader";
import "./style.css";

// Define the custom calcite elements
defineCustomElements(window, {
  resourcesUrl: "https://js.arcgis.com/calcite-components/2.4.0/assets",
});

// Get a reference to the workorder-flow html element
const flow = document.querySelector("#workorder-flow");

// When the create-work-flow-button is clicked, start the work order flow
document.querySelector("#create-work-flow-button").onclick = async () => {
  createWorkOrderFlow();
};

// Get a reference to the calcite-table
const table = document.querySelector("calcite-table");

// Create an OrientedImageryLayer
const orientedImageryLayer = new OrientedImageryLayer({
  url: "https://servicesdev.arcgis.com/SFghic860y4YxamR/arcgis/rest/services/VilniusCity_360/FeatureServer/0",
  renderer: {
    type: "simple",
    symbol: {
      type: "simple-marker",
      size: 8,
      color: [104, 108, 110, 0.5],
      outline: {
        width: 0,
      },
    },
  },
  minScale: 5000,
});

// Create a FeatureLayer for the footprints
const footprintsLayer = new FeatureLayer({
  url: "https://servicesdev.arcgis.com/SFghic860y4YxamR/arcgis/rest/services/VilniusCity_360/FeatureServer/1",
});

// Create a FeatureLayer for the work orders
const workOrdersLayer = new FeatureLayer({
  outFields: ["*"],
  title: "Work Orders",
  portalItem: {
    id: "da96fabc091f499380073b0b14c523c8",
  },
});

// Create a Map
const map = new Map({
  basemap: "satellite",
  layers: [footprintsLayer, orientedImageryLayer, workOrdersLayer],
});

// Create a MapView
const view = new MapView({
  map: map,
  container: "viewDiv",
  popupEnabled: false,
});

// When the view is ready
view.when(async () => {
  // Wait for the layers to load
  await orientedImageryLayer.load();
  await footprintsLayer.load();
  await workOrdersLayer.load();

  // Go to the full extent of the footprints layer
  view.goTo(footprintsLayer.fullExtent);

  // Wait for the work orders layer view to be ready
  const workOrdersLayerView = await view.whenLayerView(workOrdersLayer);

  // Update the table when the work orders layer is done updating
  reactiveUtils.when(
    () => !workOrdersLayerView.dataUpdating,
    () => {
      updateTable(workOrdersLayer);
    },
  );
});

// Creat a LayerList widget
const layerList = new LayerList({
  view: view,
  selectionMode: "single",
});

// Add the LayerList widget to an Expand widget
const expand = new Expand({
  view: view,
  content: layerList,
});

// Add the Expand widget to the view
view.ui.add(expand, "top-right");

// Creat an OrientedImageryViewer widget
const orientedImageryViewer = new OrientedImageryViewer({
  container: "oi-container",
  docked: true,
  dockEnabled: true,
  layer: orientedImageryLayer,
  view,
});

// Custom content for the work orders popup template
const customContent = new CustomContent({
  outFields: ["*"],
  creator: (event) => {
    const viewImageryBtn = document.createElement("calcite-button");
    viewImageryBtn.setAttribute("appearance", "outline");
    viewImageryBtn.innerText = "view available imagery";
    viewImageryBtn.onclick = () => {
      orientedImageryViewer?.loadBestImage(event.graphic.geometry);
    };
    return viewImageryBtn;
  },
});

// Text element for the work orders popup template
const textElement = {
  type: "text",
  text: 'This work order is to resolve an issue with {Category}.<br><br>Notes: "{details}"',
};

// Define the popup template for the work orders layer
workOrdersLayer.popupTemplate = new PopupTemplate({
  outFields: ["*"],
  title: "Work order",
  content: [textElement, customContent],
});

// Set up the click event for the view
view.on("click", (event) => {
  // If the map image conversion tool is active, don't do anything
  if (orientedImageryViewer.mapImageConversionToolState) {
    return;
  }

  // Stop the event from propagating
  event.stopPropagation();

  // Hit test the work orders layer
  view
    .hitTest(event, {
      layer: workOrdersLayer,
    })
    .then((response) => {
      // Get the results from the hit test response
      const { results } = response;

      // If there is a graphic from the work orders layer in the results, open the popup
      // Otherwise, load the best image from the oriented imagery layer
      if (results.length > 0 && results[0].graphic && results[0].graphic.layer === workOrdersLayer) {
        view.openPopup({
          location: event.mapPoint,
          features: [results[0].graphic],
        });
      } else {
        orientedImageryViewer.loadBestImage(event.mapPoint);
      }
    });
});

/**
 * A function to update the table with the work order data
 *
 * @param {FeatureLayer} layer
 */
async function updateTable(layer) {
  // Query the feature count
  const totalNumberOfWorkOrders = await layer.queryFeatureCount();

  // Clear the table
  table.querySelectorAll("calcite-table-row").forEach((row) => {
    if (row.slot !== "table-header") {
      row.remove();
    }
  });

  // Get an array of the category coded values
  const categoryCodedValues = [];
  layer.fields.forEach((field) => {
    if (field.name === "Category" && field.domain.type === "coded-value") {
      field.domain.codedValues.forEach((codedValue) => {
        categoryCodedValues.push(codedValue);
      });
    }
  });

  // Create a Query object
  const query = layer.createQuery();
  query.outStatistics = [
    {
      onStatisticField: "Category",
      outStatisticFieldName: "count_Category",
      statisticType: "count",
    },
  ];
  query.groupByFieldsForStatistics = ["Category"];

  // Query the features and update the table
  layer.queryFeatures(query).then((results) => {
    results.features.forEach((feature) => {
      let tableRow = document.createElement("calcite-table-row");
      const code = feature.attributes.Category;
      const categoryCodedValue = categoryCodedValues.find((value) => value.code === code);
      let nameTableCell = document.createElement("calcite-table-cell");
      nameTableCell.innerHTML = categoryCodedValue.name;
      tableRow.append(nameTableCell);

      let countTableCell = document.createElement("calcite-table-cell");
      countTableCell.innerHTML = feature.attributes.count_Category;
      tableRow.append(countTableCell);

      let percentTableCell = document.createElement("calcite-table-cell");
      let meter = document.createElement("calcite-meter");
      meter.fillType = "single";
      meter.valueLabel = true;
      meter.label = "percent";
      meter.value = Math.round((feature.attributes.count_Category / totalNumberOfWorkOrders) * 100);
      meter.max = 100;
      meter.unitLabel = "%";
      meter.valueLabelType = "units";
      meter.scale = "s";
      percentTableCell.append(meter);
      tableRow.append(percentTableCell);

      table.append(tableRow);
    });
  });
}

/**
 * A function to create the work order flow
 */
async function createWorkOrderFlow() {
  // Create the workflow item
  const workOrderFlowItem = document.createElement("calcite-flow-item");
  workOrderFlowItem.heading = "Create work order";
  workOrderFlowItem.description = "Please fill out this form";
  workOrderFlowItem.addEventListener("calciteFlowItemBack", cancelWorkflow);

  // Create the notice
  const notice = document.createElement("calcite-notice");
  notice.open = true;
  notice.width = "full";
  workOrderFlowItem.append(notice);

  // Create the notice message
  const noticeMessage = document.createElement("span");
  noticeMessage.slot = "message";
  noticeMessage.innerText = "What is the problem?";
  notice.append(noticeMessage);

  // Create a new Editor widget
  const editor = new Editor({
    view: view,
    container: workOrderFlowItem,
  });

  // If the oriented imagery viewer has a reference point add a new feature to the work orders layer
  // If not, alert the user and cancel the workflow
  if (orientedImageryViewer.referencePoint) {
    // Create a new Graphic from the reference point
    const graphic = new Graphic({
      geometry: new Point({
        x: orientedImageryViewer.referencePoint.x,
        y: orientedImageryViewer.referencePoint.y,
        spatialReference: orientedImageryViewer.referencePoint.spatialReference,
      }),
      sourceLayer: workOrdersLayer,
    });

    // Start the create features workflow with the graphic
    await editor.viewModel.startCreateFeaturesWorkflowAtFeatureEdit({
      initialFeature: graphic,
    });

    // When the workflow is committed, cancel the workflow
    editor.viewModel.on("workflow-commit", () => {
      cancelWorkflow();
    });
  } else {
    cancelWorkflow();
    alert("You need to select reference point first.");
  }

  // Append the workflow item to the work order flow
  flow.append(workOrderFlowItem);

  /**
   * A function to cancel the workflow
   */
  function cancelWorkflow() {
    if (editor) {
      const { activeWorkflow } = editor.viewModel;
      if (activeWorkflow) {
        editor.cancelWorkflow({
          force: true,
        });
        activeWorkflow?.destroy();
      }

      orientedImageryViewer.mapImageConversionToolState = false;
      flow.back();
    }
  }
}
