import {
    Array1D,
    InCPUMemoryShuffledInputProviderBuilder,
    Graph,
    Session,
    SGDOptimizer,
    NDArrayMathGPU,
    CostReduction,
} from 'deeplearn';
  
  // Encapsulates math operations on the CPU and GPU.
const math = new NDArrayMathGPU();
const INITIAL_LEARNING_RATE = 0.06;
const BATCH_SIZE = 300;
  
class ContrastAccessibilityModel {  
    constructor() {
        this.optimizer = new SGDOptimizer(INITIAL_LEARNING_RATE);
        this.session = null;
        this.inputTensor = null;
        this.targetTensor = null;
        this.costTensor = null;
        this.predictionTensor = null;
        this.feedEntries = null;
    }
  
    setupSession(trainingSet) {
        const graph = new Graph();
    
        this.inputTensor = graph.placeholder('input RGB value', [3]);
        this.targetTensor = graph.placeholder('output RGB value', [2]);
    
        let fullyConnectedLayer = this.createFullyConnectedLayer(graph, this.inputTensor, 0, 64);
        fullyConnectedLayer = this.createFullyConnectedLayer(graph, fullyConnectedLayer, 1, 32);
        fullyConnectedLayer = this.createFullyConnectedLayer(graph, fullyConnectedLayer, 2, 16);
    
        this.predictionTensor = this.createFullyConnectedLayer(graph, fullyConnectedLayer, 3, 2);
        this.costTensor = graph.meanSquaredCost(this.targetTensor, this.predictionTensor);
    
        this.session = new Session(graph, math);
    
        this.prepareTrainingSet(trainingSet);
    }
  
    prepareTrainingSet(trainingSet) {
        math.scope(() => {
            const { rawInputs, rawTargets } = trainingSet;
        
            const inputArray = rawInputs.map(v => Array1D.new(this.normalizeColor(v)));
            const targetArray = rawTargets.map(v => Array1D.new(v));
        
            const shuffledInputProviderBuilder = new InCPUMemoryShuffledInputProviderBuilder([ inputArray, targetArray ]);
            const [ inputProvider, targetProvider ] = shuffledInputProviderBuilder.getInputProviders();
        
            this.feedEntries = [
                { tensor: this.inputTensor, data: inputProvider },
                { tensor: this.targetTensor, data: targetProvider },
            ];
        });
    }
  
    train(step, computeCost) {
        // Every 50 steps, lower the learning rate by 10%.
        let learningRate = INITIAL_LEARNING_RATE * Math.pow(0.90, Math.floor(step / 50));
        this.optimizer.setLearningRate(learningRate);
    
        // Train one batch.
        let costValue;
        math.scope(() => {
            const cost = this.session.train(
            this.costTensor,
            this.feedEntries,
            BATCH_SIZE,
            this.optimizer,
            computeCost ? CostReduction.MEAN : CostReduction.NONE,
            );
    
            // Compute the cost (by calling get), which requires transferring data from the GPU.
            if (computeCost) {
                costValue = cost.get();
            }
        });
    
        return costValue;
    }
  
    predict(rgb) {
        let classifier = [];
    
        math.scope(() => {
            const mapping = [{
                tensor: this.inputTensor,
                data: Array1D.new(this.normalizeColor(rgb)),
            }];
    
            classifier = this.session.eval(this.predictionTensor, mapping).getValues();
        });
    
        return [ ...classifier ];
    }
  
    createFullyConnectedLayer(
        graph,
        inputLayer,
        layerIndex,
        units,
        activationFunction
    ) {
        return graph.layers.dense(
            `fully_connected_${layerIndex}`,
            inputLayer,
            units,
            activationFunction
            ? activationFunction
            : (x) => graph.relu(x)
        );
    }
  
    normalizeColor(rgb) {
        return rgb.map(v => v / 255);
    }
}
  
export default ColorAccessibilityModel;