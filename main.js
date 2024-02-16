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

defineCustomElements(window, {
  resourcesUrl: "https://js.arcgis.com/calcite-components/2.4.0/assets",
});

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

const footprintsLayer = new FeatureLayer({
  url: "https://servicesdev.arcgis.com/SFghic860y4YxamR/arcgis/rest/services/VilniusCity_360/FeatureServer/1",
});

const workOrdersLayer = new FeatureLayer({
  outFields: ["*"],
  title: "Work Orders",
  portalItem: {
    id: "da96fabc091f499380073b0b14c523c8",
  },
});

const map = new Map({
  basemap: "satellite",
  layers: [footprintsLayer, orientedImageryLayer, workOrdersLayer],
});

const view = new MapView({
  map: map,
  container: "viewDiv",
  popupEnabled: false,
});

view.when(async () => {
  await orientedImageryLayer.load();
  await footprintsLayer.load();
  await workOrdersLayer.load();

  view.goTo(footprintsLayer.fullExtent);

  const workOrdersLayerView = await view.whenLayerView(workOrdersLayer);
  reactiveUtils.when(
    () => !workOrdersLayerView.dataUpdating,
    () => {
      updateTable(workOrdersLayer);
    },
  );
});

/*************************************
 Widgets/components
*************************************/
// LayerList
const layerList = new LayerList({
  view: view,
  selectionMode: "single",
});
const expand = new Expand({
  view: view,
  content: layerList,
});
view.ui.add(expand, "bottom-left");

// OrientedImageryViewer
const orientedImageryViewer = new OrientedImageryViewer({
  container: "oi-container",
  docked: true,
  dockEnabled: true,
  layer: orientedImageryLayer,
  view,
});
const flow = document.getElementById("workorder-flow");

/*************************************
 Popup setup
*************************************/
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

const textElement = {
  type: "text",
  text: 'This work order is to resolve an issue with {Category}.<br><br>Notes: "{details}"',
};

workOrdersLayer.popupTemplate = new PopupTemplate({
  outFields: ["*"],
  title: "Work order",
  content: [textElement, customContent],
});

/*************************************
 Now wire it together
*************************************/

//when the user clicks on a feature show a popup, if not, pull up the imagery
view.on("click", (event) => {
  if (orientedImageryViewer.mapImageConversionToolState) {
    return;
  }
  event.stopPropagation();
  view
    .hitTest(event, {
      layer: workOrdersLayer,
    })
    .then((response) => {
      const { results } = response;
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

document.getElementById("create-work-flow-button").onclick = async () => {
  //start the work order flow
  createWorkOrderFlow();
};

/*************************************
 Table setup
*************************************/
const table = document.querySelector("calcite-table");

async function updateTable(layer) {
  const totalNumberOfWorkOrders = await layer.queryFeatureCount();

  table.querySelectorAll("calcite-table-row").forEach((row) => {
    if (row.slot !== "table-header") {
      row.remove();
    }
  });

  const categoryCodedValues = [];
  layer.fields.forEach((field) => {
    if (field.name === "Category" && field.domain.type === "coded-value") {
      field.domain.codedValues.forEach((codedValue) => {
        categoryCodedValues.push(codedValue);
      });
    }
  });

  const query = layer.createQuery();
  query.outStatistics = [
    {
      onStatisticField: "Category",
      outStatisticFieldName: "count_Category",
      statisticType: "count",
    },
  ];
  query.groupByFieldsForStatistics = ["Category"];

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

/*************************************
 Setup flow
*************************************/
async function createWorkOrderFlow() {
  //Create UI
  const workOrderFlowItem = document.createElement("calcite-flow-item");
  workOrderFlowItem.heading = "Create work order";
  workOrderFlowItem.description = "Please fill out this form";

  const notice = document.createElement("calcite-notice");
  notice.open = true;
  notice.width = "full";
  workOrderFlowItem.append(notice);

  const noticeMessage = document.createElement("span");
  noticeMessage.slot = "message";
  noticeMessage.innerText = "What is the problem?";
  notice.append(noticeMessage);

  const editor = new Editor({
    view: view,
    container: workOrderFlowItem,
  });

  if (orientedImageryViewer.referencePoint) {
    const featureToCreate = new Graphic({
      geometry: new Point({
        x: orientedImageryViewer.referencePoint.x,
        y: orientedImageryViewer.referencePoint.y,
        spatialReference: orientedImageryViewer.referencePoint.spatialReference,
      }),
      sourceLayer: workOrdersLayer,
    });

    await editor.viewModel.startCreateFeaturesWorkflowAtFeatureEdit({
      initialFeature: featureToCreate,
    });

    editor.viewModel.on("workflow-commit", () => {
      cancelWorkflow();
    });
  } else {
    console.warn("need to select reference point first.");
  }

  workOrderFlowItem.addEventListener("calciteFlowItemBack", cancelWorkflow);

  flow.append(workOrderFlowItem);

  function cancelWorkflow() {
    console.log("cancelWorkflow");
    if (editor) {
      const { activeWorkflow } = editor.viewModel;
      if (activeWorkflow) {
        editor.cancelWorkflow({
          force: true,
        });
      }
    }
  }
}
