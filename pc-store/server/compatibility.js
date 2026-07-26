// Правила проверки совместимости сборки ПК.
// Принимает объект { cpu, motherboard, ram, gpu, storage, psu, case } с товарами (или null).
// Возвращает { ok: boolean, issues: [{ level: 'error'|'warning', message }] }

function checkBuild(build) {
  const issues = [];
  const { cpu, motherboard, ram, gpu, storage, psu, cooler, case: pcCase } = build;

  // CPU <-> Материнская плата: сокет
  if (cpu && motherboard) {
    if (cpu.specs.socket !== motherboard.specs.socket) {
      issues.push({
        level: "error",
        message: `Процессор ${cpu.name} (сокет ${cpu.specs.socket}) не подходит к плате ${motherboard.name} (сокет ${motherboard.specs.socket}).`,
      });
    }
  }

  // Охлаждение (СЖО) <-> Процессор: сокет и допустимый TDP
  if (cooler && cpu) {
    if (!cooler.specs.sockets.includes(cpu.specs.socket)) {
      issues.push({
        level: "error",
        message: `Охлаждение ${cooler.name} не поддерживает сокет ${cpu.specs.socket} (процессор ${cpu.name}).`,
      });
    }
    if (cooler.specs.tdpRating < cpu.specs.tdp) {
      issues.push({
        level: "warning",
        message: `Охлаждение ${cooler.name} рассчитано на TDP до ${cooler.specs.tdpRating}Вт, а у процессора ${cpu.name} — ${cpu.specs.tdp}Вт.`,
      });
    }
  }

  // Охлаждение (СЖО) <-> Корпус: радиатор помещается
  if (cooler && pcCase && pcCase.specs.maxRadiatorSizeMM) {
    if (cooler.specs.radiatorSizeMM > pcCase.specs.maxRadiatorSizeMM) {
      issues.push({
        level: "error",
        message: `Радиатор СЖО ${cooler.name} (${cooler.specs.radiatorSizeMM}мм) не помещается в корпус ${pcCase.name} (макс. ${pcCase.specs.maxRadiatorSizeMM}мм).`,
      });
    }
  }

  // RAM <-> Материнская плата: тип памяти
  if (ram && motherboard) {
    if (ram.specs.type !== motherboard.specs.ramType) {
      issues.push({
        level: "error",
        message: `Память ${ram.name} — это ${ram.specs.type}, а плата ${motherboard.name} поддерживает только ${motherboard.specs.ramType}.`,
      });
    }
    if (ram.specs.modules > motherboard.specs.ramSlots) {
      issues.push({
        level: "error",
        message: `Комплект памяти содержит ${ram.specs.modules} модуля(ей), а на плате всего ${motherboard.specs.ramSlots} слот(ов).`,
      });
    }
    if (ram.specs.capacityGB > motherboard.specs.maxRamGB) {
      issues.push({
        level: "warning",
        message: `Плата официально поддерживает до ${motherboard.specs.maxRamGB} ГБ памяти.`,
      });
    }
  }

  // Материнская плата <-> Корпус: форм-фактор
  if (motherboard && pcCase) {
    if (!pcCase.specs.formFactors.includes(motherboard.specs.formFactor)) {
      issues.push({
        level: "error",
        message: `Корпус ${pcCase.name} не поддерживает форм-фактор платы (${motherboard.specs.formFactor}).`,
      });
    }
  }

  // Видеокарта <-> Корпус: длина
  if (gpu && pcCase) {
    if (gpu.specs.lengthMM > pcCase.specs.maxGpuLengthMM) {
      issues.push({
        level: "error",
        message: `Видеокарта ${gpu.name} (${gpu.specs.lengthMM} мм) длиннее, чем допускает корпус (макс. ${pcCase.specs.maxGpuLengthMM} мм).`,
      });
    }
  }

  // Блок питания: суммарная мощность
  if (psu) {
    const cpuTdp = cpu ? cpu.specs.tdp : 0;
    const gpuTdp = gpu ? gpu.specs.tdp : 0;
    const baseDraw = 80; // мат.плата, накопители, кулеры
    const estimatedLoad = cpuTdp + gpuTdp + baseDraw;
    const recommended = gpu ? gpu.specs.recommendedPSU : estimatedLoad + 100;

    if (psu.specs.wattage < estimatedLoad) {
      issues.push({
        level: "error",
        message: `Блок питания ${psu.name} (${psu.specs.wattage} Вт) не хватает для оценочной нагрузки ~${estimatedLoad} Вт.`,
      });
    } else if (psu.specs.wattage < recommended) {
      issues.push({
        level: "warning",
        message: `Для видеокарты ${gpu ? gpu.name : ""} рекомендуется БП от ${recommended} Вт, без запаса по мощности для апгрейдов.`,
      });
    }
  }

  const missing = ["cpu", "motherboard", "ram", "psu", "case"].filter((k) => !build[k]);
  if (missing.length) {
    issues.push({
      level: "warning",
      message: `Для полной сборки не хватает: ${missing.join(", ")}.`,
    });
  }

  const hasErrors = issues.some((i) => i.level === "error");
  return { ok: !hasErrors, issues };
}

module.exports = { checkBuild };
