import { analyticsService } from '../services/analytics.Service.js';

const analyticsController = {
  getDashboard: async (req, res) => {
    try {
      // Más adelante leeremos req.query.startDate para los filtros
      const { startDate, endDate } = req.query;
      
      const dashboardData = await analyticsService.getGeneralDashboard(startDate, endDate, req.user);
      
      res.json(dashboardData);
    } catch (error) {
      console.error("ERROR EN ANALÍTICA:", error.message);
      res.status(500).json({ error: error.message });
    }
  }
};

export default analyticsController;