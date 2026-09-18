DECLARE @dtStart Datetime  = '2018 - 03 - 21 00:00:00'

DECLARE @dtEnd Datetime  = '2036 - 09 - 18 23:59:59'

SELECT  Distinct tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, 
      asset.Location,  asset.block,  tsk.TaskTtl, tsk.Descriptions, tsk.Complited,
              FORMAT(TD.DueDateTime,'yyyy/MM/dd  HH:mm','fa')
 FROM Tsk_tbl tsk 
      LEFT JOIN Asset_Task_tbl assettsk 
    ON tsk.TaskID = assettsk.TaskID
      LEFT JOIN Asset_2_tbl asset 
    ON assettsk.AssetID = asset.AssetID 
      LEFT JOIN TimeDate_tbl TD
    ON TD.TaskID=tsk.TaskID
      LEFT JOIN Purchase_Request_tbl PR
    ON PR.TaskID=tsk.TaskID
      WHERE tsk.TaskTtl LIKE N'%%' AND tsk.Descriptions LIKE N'%%'  
         AND asset.AssetName like N'%%' AND asset.Building like  N'%%' 
         AND asset.Block like N'%%'  
       AND asset.Entrance like  N'%%' AND asset.Location like  N'%%'
          AND asset.AssetNumber like N'%%' AND asset.MechSystem like  N'%%' 
       AND asset.Specifications like  N'%%' 
       AND  ((TD.DueDateTime >= CONVERT(DATETIME, @dtStart, 102)) AND
            (TD.EndDateTime <= CONVERT(DATETIME, @dtEnd, 102)))  
         And (tsk.Complited = 0)  
       ORDER BY FORMAT(TD.DueDateTime,'yyyy/MM/dd  HH:mm','fa')



SELECT  Distinct tsk.TaskID, asset.AssetName, asset.AssetNumber, asset.Building, 
                                asset.Location, asset.block, tsk.TaskTtl, tsk.Descriptions, tsk.Complited, TD.Priorities, TD.DueDateTime, TD.EndDateTime, TD.Submit_Date
                              FROM Tsk_tbl tsk 
                                LEFT JOIN Asset_Task_tbl assettsk 
                              ON tsk.TaskID = assettsk.TaskID
                                LEFT JOIN Asset_2_tbl asset 
                              ON assettsk.AssetID = asset.AssetID 
                                LEFT JOIN TimeDate_tbl TD
                              ON TD.TaskID=tsk.TaskID
                                LEFT JOIN Purchase_Request_tbl PR
                              ON PR.TaskID=tsk.TaskID
                                WHERE tsk.TaskTtl LIKE N'%%' AND  tsk.Descriptions LIKE N'%%' 
                                   AND asset.AssetName like N'%%' AND asset.Building like  N'%%' 
                                   AND asset.Block like N'%%'  
                                 AND asset.Entrance like  N'%%' AND asset.Location like  N'%%'
                                    AND asset.AssetNumber like N'%%' AND asset.MechSystem like  N'%%' 
                                 AND asset.Specifications like  N'%%' 
                                   AND  ((TD.DueDateTime >= CONVERT(DATETIME, @dtStart, 102)) AND
                                 (TD.EndDateTime <= CONVERT(DATETIME, @dtEnd, 102)))  
                                   And tsk.Complited = 0 
                                ORDER BY TD.DueDateTime