import Graphic from "@arcgis/core/Graphic";
import WebMap from "@arcgis/core/WebMap";
import CustomContent from "@arcgis/core/popup/content/CustomContent";
import MapView from "@arcgis/core/views/MapView";
import Editor from "@arcgis/core/widgets/Editor";
import OrientedImageryViewer from "@arcgis/core/widgets/OrientedImageryViewer";
import Popup from "@arcgis/core/widgets/Popup";
import { defineCustomElements } from "@esri/calcite-components/dist/loader";
import "./style.css";

// Define the custom calcite elements
defineCustomElements(window, {
  resourcesUrl: "https://js.arcgis.com/calcite-components/2.4.0/assets",
});

// Create a variable for the Editor widget
let editor;

// Get a reference to the workorder-flow html element
const flow = document.querySelector("#workorder-flow");

// Get a reference to the calcite-table
const table = document.querySelector("calcite-table");

// Step 1: Create a web map
// Create a WebMap
const map = new WebMap({
  portalItem: {
    id: "076252b0fce8469ea45558f6b7b928ca",
  },
});

// Step 2: Create a MapView
// Create a MapView
const view = new MapView({
  container: "viewDiv",
  map,
  popupEnabled: false,
});

// Wait for the view to load
view.when(async () => {
  // Wait for all the map layers to load
  await view.map.loadAll();

  // Step 3: Get references to the layers in the web map
  const buildingLayer = view.map.findLayerById("b5435bf9aa674c4f97dab633ce50ff65");
  const orientedImageryLayer = view.map.findLayerById("18df554895b-layer-5");
  const workOrdersLayer = view.map.findLayerById("5a5382f83c48491c888184bd664cb5d8");

  // Step 4: Create the OrientedImageryViewer
  // Create an OrientedImageryViewer widget
  const orientedImageryViewer = new OrientedImageryViewer({
    container: "oi-container",
    docked: true,
    dockEnabled: true,
    layer: orientedImageryLayer,
    view,
  });

  // Step 5: Add a load best image button to the work orders popup
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
  workOrdersLayer.popupTemplate.content.push(customContent);

  // Step 6: Set up the click event for the view
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
        if (results[0]?.graphic?.layer === workOrdersLayer || results[0]?.graphic?.layer === buildingLayer) {
          const popup = new Popup({
            dockEnabled: true,
            dockOptions: {
              breakpoint: false,
            },
          });
          view.popup = popup;
          popup.open({
            location: event.mapPoint,
            features: [results[0].graphic],
          });
        } else {
          orientedImageryViewer.loadBestImage(event.mapPoint);
        }
      });
  });

  // When the create-work-flow-button is clicked, start the work order flow
  document.querySelector("#create-work-flow-button").onclick = async () => {
    createWorkOrderFlow(orientedImageryViewer, workOrdersLayer);
  };

  // Update the table with the work order data
  updateTable(workOrdersLayer);
});

/**
 * A function to create the work order flow
 */
async function createWorkOrderFlow(orientedImageryViewer, workOrdersLayer) {
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

  // Append the workflow item to the work order flow
  flow.append(workOrderFlowItem);

  // Step 7: Create the Editor widget
  // Create a new Editor widget
  editor = new Editor({
    view: view,
    container: workOrderFlowItem,
  });

  // Step 8: Start the create features workflow
  // If the oriented imagery viewer has a reference point add a new feature to the work orders layer
  // If not, alert the user and cancel the workflow
  if (orientedImageryViewer.referencePoint) {
    // Create a new Graphic from the reference point
    const graphic = new Graphic({
      attributes: {},
      geometry: orientedImageryViewer.referencePoint,
      layer: workOrdersLayer,
    });

    // Start the create features workflow with the graphic
    await editor.viewModel.startCreateFeaturesWorkflowAtFeatureEdit({
      initialFeature: graphic,
    });

    // When the workflow is committed, cancel the workflow
    editor.viewModel.on("workflow-commit", () => {
      updateTable(workOrdersLayer);
      cancelWorkflow();
    });
  } else {
    cancelWorkflow();
    alert("You need to select reference point first.");
  }

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
      orientedImageryViewer.referencePoint = null;
      flow.back();
    }
  }
}

/**
 * A function to update the table with the work order data
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
      const tableRow = document.createElement("calcite-table-row");
      const code = feature.attributes.Category;
      const categoryCodedValue = categoryCodedValues.find((value) => value.code === code);
      const nameTableCell = document.createElement("calcite-table-cell");
      nameTableCell.innerHTML = categoryCodedValue.name;
      tableRow.append(nameTableCell);

      const countTableCell = document.createElement("calcite-table-cell");
      countTableCell.alignment = "center";
      countTableCell.innerHTML = feature.attributes.count_Category;
      tableRow.append(countTableCell);

      const percentTableCell = document.createElement("calcite-table-cell");
      const meter = document.createElement("calcite-meter");
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
